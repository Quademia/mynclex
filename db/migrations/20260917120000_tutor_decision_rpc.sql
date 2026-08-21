-- mynclex/db/migrations/20260917120000_tutor_decision_rpc.sql
--
-- Tutor onboarding — slice 1d-ii: the one way a tutor's standing changes.
-- Plan: docs/product-plan/tutor-onboarding.md §7, §11.1d.
--
-- ⭐ WHY THIS IS A FUNCTION AND NOT AN .update() FROM TYPESCRIPT. 1d-i
-- put the narrative (decision_history) beside the state (status,
-- decided_*) and made a promise: the two cannot disagree. Keeping that
-- promise needs the scalar write and the history append in ONE statement,
-- because the entry's `from` must be the row's own current status —
-- readable only inside the UPDATE, where the right-hand side still sees
-- the OLD row. A read-then-write from the client would break it twice
-- over: two admins acting at once lose an entry, and the value written as
-- `from` is whatever was true when the read happened, not when the write
-- landed.
--
-- ⚠ IT ALSO RE-CHECKS THE PERMISSION INSIDE, like the 1c lookups. A
-- SECURITY DEFINER function that trusts its caller is a hole — EXECUTE is
-- granted to `authenticated`, which is every signed-in student.
--
-- ⭐ AND IT REFUSES TO DECIDE ON THE CALLER'S OWN ROW — see §3 below.
-- This is not in the design handoff; it is the same hole 1a closed with
-- column privileges, re-opened by the existence of this function.

-- ── the transition ───────────────────────────────────────────────────
-- Returns one row describing what actually happened, so the caller can
-- word the toast from the truth rather than from what it asked for:
--   changed = false means the row was ALREADY in that state.

CREATE OR REPLACE FUNCTION nclex_tutor_record_decision(
  p_user_id   UUID,
  p_to_status TEXT,
  p_reason    TEXT DEFAULT NULL
)
RETURNS TABLE (
  changed     BOOLEAN,
  from_status TEXT,
  to_status   TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  current_status TEXT;
  reason_clean   TEXT;
  actor          UUID;
BEGIN
  -- 1. Who is asking, and may they.
  actor := auth.uid();

  IF NOT nclex_user_has_permission('TUTORS_MANAGE') THEN
    RAISE EXCEPTION 'nclex_tutor_record_decision: TUTORS_MANAGE required';
  END IF;

  -- 2. Only decisions an ADMIN makes. PENDING is deliberately not
  --    accepted: returning a row to PENDING is a RE-APPLICATION, an act
  --    of the applicant with its own path (slice 2), and letting it in
  --    here would let an admin quietly un-decide a rejection with no
  --    record of a new submission.
  IF p_to_status NOT IN ('APPROVED', 'SUSPENDED', 'REJECTED') THEN
    RAISE EXCEPTION 'nclex_tutor_record_decision: % is not an admin decision', p_to_status;
  END IF;

  -- 3. ⭐ NOBODY DECIDES ON THEMSELVES. 1a spent a migration ensuring a
  --    tutor could not run `update nclex_tutors set status = 'APPROVED'`
  --    on their own row. This function runs as its definer, so without
  --    this check any tutor who ALSO holds TUTORS_MANAGE could lift their
  --    own suspension through it — handing back exactly what the column
  --    privileges took away, to the population most likely to be both.
  --    (Sam is both today.) Suspension is a judgement about a person;
  --    the person is not the one who gets to make it.
  IF p_user_id = actor THEN
    RAISE EXCEPTION 'nclex_tutor_record_decision: an admin cannot decide on their own tutor record';
  END IF;

  -- 4. A reason is REQUIRED for the two decisions that go against
  --    someone. The UI disables the button until the box has text; this
  --    is the same rule at the layer that cannot be skipped. Approval
  --    needs none — "why did you say yes" is not a question anyone asks
  --    months later, and demanding one produces "ok" in every row.
  reason_clean := NULLIF(btrim(COALESCE(p_reason, '')), '');

  IF p_to_status IN ('SUSPENDED', 'REJECTED') AND reason_clean IS NULL THEN
    RAISE EXCEPTION 'nclex_tutor_record_decision: % requires a reason', p_to_status;
  END IF;

  -- 5. The row must exist. §4.4 says every doorway writes one, so a
  --    missing row is a bug upstream, not a person to be decided about.
  SELECT t.status INTO current_status
    FROM nclex_tutors t
   WHERE t.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'nclex_tutor_record_decision: no tutor record for %', p_user_id;
  END IF;

  -- 6. Idempotent, like grantTutorRole. Suspending an already-suspended
  --    tutor is a double-click or two admins agreeing, not a second
  --    event — appending an identical entry would put noise in the one
  --    place that exists to be read carefully.
  IF current_status = p_to_status THEN
    RETURN QUERY SELECT FALSE, current_status, p_to_status;
    RETURN;
  END IF;

  -- 7. ⭐ THE WHOLE POINT: state and narrative in one statement.
  --    `t.status` on the right-hand side is the OLD value — that is what
  --    makes the entry's `from` correct by construction rather than by
  --    the caller remembering to pass it.
  UPDATE nclex_tutors t SET
    status          = p_to_status,
    decided_at      = now(),
    decided_by      = actor,
    decision_reason = reason_clean,
    -- approved_* is the permanent vetting fact — set once on FIRST
    -- approval and never overwritten, so a reinstatement does not
    -- rewrite who originally let this person in.
    approved_at     = COALESCE(t.approved_at,
                        CASE WHEN p_to_status = 'APPROVED' THEN now() END),
    approved_by     = COALESCE(t.approved_by,
                        CASE WHEN p_to_status = 'APPROVED' THEN actor END),
    updated_at      = now(),
    decision_history = t.decision_history || jsonb_build_object(
                        'at',     now(),
                        'by',     actor,
                        'from',   t.status,
                        'to',     p_to_status,
                        'reason', reason_clean)
  WHERE t.user_id = p_user_id;

  RETURN QUERY SELECT TRUE, current_status, p_to_status;
END;
$fn$;

GRANT EXECUTE ON FUNCTION nclex_tutor_record_decision(UUID, TEXT, TEXT) TO authenticated;
