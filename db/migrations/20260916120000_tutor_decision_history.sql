-- mynclex/db/migrations/20260916120000_tutor_decision_history.sql
--
-- Tutor onboarding — slice 1d-i: the decision history.
-- Plan: docs/product-plan/tutor-onboarding.md (§7, §9, §11.1d).
--
-- ⭐ WHY NOW, AND NOT EARLIER. Until 1d, no tutor row could carry more
-- than ONE decision: every doorway ends in a single APPROVED (admin
-- promotion, invite) or a single PENDING (application). So the drawer's
-- derived trail — read straight off approved_at/decided_at — was not
-- wrong, it was sufficient by accident. Suspend/reinstate is the first
-- thing in the arc that produces a SECOND decision, and a third, and a
-- fourth. From the moment 1d ships, a scalar decision_reason holds the
-- latest reason and silently forgets every one before it.
--
-- ⭐ WHY A COLUMN AND NOT A TABLE (Sam's call, 2026-08-21). An events
-- table was proposed during design and rejected (§13), and this keeps
-- that rejection intact rather than smuggling it back in one slice
-- later. The rule of thumb we settled: an append-only JSONB array is
-- right while the history is short, bounded, and only ever read WHOLE —
-- a tutor accumulates a handful of decisions in a lifetime. The day
-- something needs to query ACROSS rows ("how many suspensions this
-- quarter", "every decision this admin made"), that is the signal it has
-- earned a table. Nothing does today.
--
-- ⚠ THE SCALARS STAY AUTHORITATIVE. status / decided_at / decided_by /
-- decision_reason keep their exact meaning: "what is true NOW". This
-- column answers a different question — "how did we get here" — and has
-- different readers. The public views, the RLS policies and
-- nclex_tutors_status_idx only ever ask the first, and they need it
-- indexable; making "is this tutor live?" walk a JSON array would put a
-- narrative on the load-bearing path that decides what the public sees.
--
-- ⚠ HOW DRIFT IS PREVENTED. Not by discipline — by writing both in ONE
-- statement. Slice 1d-ii adds nclex_tutor_record_decision(), which sets
-- the scalars and appends the entry together, reading the row's own
-- current status for the entry's `from`. A read-then-write in TypeScript
-- could not do that: two admins clicking at once would lose an entry,
-- and the entry could disagree with the column it came from.
--
-- ⓘ NO NEW COLUMN GRANT IS NEEDED. 1a revoked UPDATE wholesale and
-- handed back exactly (public_profile, updated_at). A column added later
-- carries no grant, so `authenticated` cannot write this one — the
-- self-approval guard covers it for free. Do not "fix" that by adding it
-- to the grant list.
--
-- ⓘ ON WHAT THE TUTOR CAN READ (settled: option (i)). nclex_tutors_self_read
-- admits `user_id = auth.uid()`, so a tutor can already read their own
-- decision_reason and will now be able to read the whole history. That is
-- accepted deliberately: reasons are written as if the subject will read
-- them, which is what the suspend form already promises ("kept on the
-- record — shown if they ever re-apply"). The alternative — a
-- column-level SELECT revoke, mirroring the UPDATE guard — was considered
-- and NOT taken: it makes `select *` on this table ERROR for every
-- tutor-facing path rather than quietly omit a column, which is exactly
-- the invisible-to-tsc failure this repo keeps meeting. It stays
-- available if internal candour is ever needed.

-- ─────────────────────────────────────────────────────────
-- 1. The column
-- ─────────────────────────────────────────────────────────
-- Entry shape, one shape for the whole story:
--   { "at": timestamptz, "by": uuid|null, "from": status|null,
--     "to": status, "reason": text|null }
--
-- Every event IS a status transition — re-application included, since it
-- returns the row to PENDING — so applied → rejected → re-applied →
-- approved → suspended → reinstated is six entries of one shape and the
-- renderer needs no special cases.
--
-- `by` is a bare uuid, not a name snapshot: the directory already resolves
-- decider ids to names in one batched read, and a stored name would rot
-- the day someone changes theirs.

ALTER TABLE nclex_tutors
  ADD COLUMN IF NOT EXISTS decision_history JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Cheap insurance that this stays an array. Without it a future writer
-- could store an object and every reader that maps over it breaks at
-- render time, in the admin's face, rather than at write time.
ALTER TABLE nclex_tutors
  DROP CONSTRAINT IF EXISTS nclex_tutors_decision_history_is_array;
ALTER TABLE nclex_tutors
  ADD CONSTRAINT nclex_tutors_decision_history_is_array
  CHECK (jsonb_typeof(decision_history) = 'array');

COMMENT ON COLUMN nclex_tutors.decision_history IS
  'Append-only trail of status transitions: {at, by, from, to, reason}. '
  'The scalar status/decided_*/decision_reason remain authoritative for '
  'current state; this is the narrative. Written only by '
  'nclex_tutor_record_decision().';

-- ─────────────────────────────────────────────────────────
-- 2. Backfill — from what we HOLD, and nothing else
-- ─────────────────────────────────────────────────────────
-- ⚠ THE LEGACY LESSON APPLIES HERE. 20260914120000 exists because a
-- previous backfill asserted "nobody knows who approved them" over data
-- the database was holding all along, and the UI spent an afternoon
-- rendering "Unknown · predates the record" on top of real dates. So this
-- reconstructs ONLY what the columns actually say, and a row with no
-- known decision gets NO entry rather than an invented one.
--
-- It reproduces exactly what the drawer derives today — application,
-- approval, and at most one later decision — which is what makes the
-- verification honest: every existing row's trail must read the same
-- before and after this migration.
--
-- Guarded by `decision_history = '[]'` so re-running cannot double-append.

UPDATE nclex_tutors SET decision_history =
  -- (a) the application, if there was one. ADMIN_PROMOTION and
  --     ADMIN_INVITE rows have no application step and get nothing here.
  (CASE WHEN first_applied_at IS NOT NULL THEN
     jsonb_build_array(jsonb_build_object(
       'at',     first_applied_at,
       'by',     NULL,
       'from',   NULL,
       'to',     'PENDING',
       'reason', NULL))
   ELSE '[]'::jsonb END)
  ||
  -- (b) the first approval — the permanent vetting fact.
  (CASE WHEN approved_at IS NOT NULL THEN
     jsonb_build_array(jsonb_build_object(
       'at',     approved_at,
       'by',     approved_by,
       'from',   CASE WHEN first_applied_at IS NOT NULL THEN 'PENDING' END,
       'to',     'APPROVED',
       'reason', NULL))
   ELSE '[]'::jsonb END)
  ||
  -- (c) a LATER decision, if the last one is not the approval itself.
  --     `IS DISTINCT FROM` rather than <> so a never-approved REJECTED
  --     row (approved_at NULL) is still caught.
  (CASE WHEN decided_at IS NOT NULL AND decided_at IS DISTINCT FROM approved_at THEN
     jsonb_build_array(jsonb_build_object(
       'at',     decided_at,
       'by',     decided_by,
       'from',   CASE WHEN approved_at IS NOT NULL THEN 'APPROVED'
                      WHEN first_applied_at IS NOT NULL THEN 'PENDING' END,
       'to',     status,
       'reason', decision_reason))
   ELSE '[]'::jsonb END)
WHERE decision_history = '[]'::jsonb;

-- ─────────────────────────────────────────────────────────
-- 3. Verify, or refuse to apply
-- ─────────────────────────────────────────────────────────
-- Same posture as 20260914120000: RAISE rather than half-apply. A silent
-- partial backfill here would show an admin a trail that omits the very
-- approval they are looking at.

DO $$
DECLARE
  missing INT;
  disagreeing INT;
BEGIN
  -- Every row that records an approval must show one.
  SELECT COUNT(*) INTO missing
    FROM nclex_tutors
   WHERE approved_at IS NOT NULL
     AND NOT (decision_history @> '[{"to":"APPROVED"}]'::jsonb);

  IF missing > 0 THEN
    RAISE EXCEPTION
      'decision_history backfill incomplete: % approved row(s) have no APPROVED entry', missing;
  END IF;

  -- The last entry must agree with the column that is authoritative.
  -- If these two ever disagree the narrative is lying about the state.
  SELECT COUNT(*) INTO disagreeing
    FROM nclex_tutors
   WHERE jsonb_array_length(decision_history) > 0
     AND decision_history -> -1 ->> 'to' IS DISTINCT FROM status;

  IF disagreeing > 0 THEN
    RAISE EXCEPTION
      'decision_history backfill inconsistent: % row(s) whose last entry disagrees with status', disagreeing;
  END IF;
END $$;
