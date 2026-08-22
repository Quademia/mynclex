-- mynclex/db/migrations/20260921120000_tutor_self_application.sql
--
-- Tutor onboarding, sub-slice 2a-i: let a person apply to become a tutor.
-- Plan: docs/product-plan/tutor-onboarding.md §5 (routing), §8 (states),
-- §9 (re-application).
--
-- ⭐ WHY THIS NEEDS A FUNCTION AT ALL. nclex_tutors' INSERT policy is
-- `nclex_user_has_permission('TUTORS_MANAGE')` — 1a wrote it that way
-- because at the time an admin was the only thing that could create a
-- tutor record. An applicant holds no permission, so they cannot write
-- their own row, and the self-UPDATE policy that does exist is narrowed
-- by 1a's column privileges to public_profile alone. Opening either up
-- would hand the applicant the status column, which is the one thing they
-- must never touch.
--
-- ⚠⚠ IT TAKES NO USER ID. Everything is written from auth.uid(). That is
-- §5's identity rule made structural rather than left as a check somebody
-- could forget: a typed email decides which BRANCH of the form you are
-- in, and it never decides WHOSE row gets written. Without this, §9's
-- "update the row in place" turns a stranger typing a live tutor's
-- address into a takedown — their APPROVED row knocked back to PENDING
-- with a profile they never wrote.
--
-- ⚠ AND IT IS SECURITY DEFINER, SO IT MUST RE-CHECK WHAT THE COLUMN
-- GRANTS WOULD HAVE STOPPED. The lesson from 1d, banked the hard way:
-- 1a spent a migration stopping a tutor writing their own `status`, and
-- the first SECURITY DEFINER function over the same table handed it
-- straight back. So this one writes status = 'PENDING' as a literal, and
-- never touches approved_*, decided_* or decision_reason — a decision is
-- an admin's act, and an application is not one.

-- ── who may apply, and who may not ───────────────────────────────────
--
-- ⚠ SUSPENDED IS REFUSED, and it is the guard this function exists to
-- carry. §6: the only arrow into PENDING is from REJECTED, or from
-- nothing at all. Allowing SUSPENDED → PENDING would let a suspended
-- tutor launder their own standing — re-apply, sit in the queue as an
-- ordinary applicant, and be re-approved by an admin who does not read
-- the history. nclex_tutor_record_decision already refuses every move to
-- PENDING on the admin side; this is the same rule at the other door.
--
-- ⓘ The sign-in bounce in front of this form is ROUTING, NOT SECURITY. A
-- suspended tutor can still log in — suspension revokes the ROLE, not
-- the account — so they reach this function and it has to say no.
--
-- APPROVED is refused too, for the duller reason that they are already a
-- tutor and there is nothing to apply for.

CREATE OR REPLACE FUNCTION nclex_tutor_submit_application(
  p_organisation TEXT,
  p_request_note TEXT,
  -- SELF_APPLICATION when the account already existed, REGISTRATION when
  -- the form created it moments ago (2a-ii). Nothing branches on it — it
  -- is provenance for the admin directory (§5) — but "was already our
  -- student" is a real vetting signal and cannot be reconstructed later.
  p_source       TEXT DEFAULT 'SELF_APPLICATION'
)
RETURNS TABLE (
  created          BOOLEAN,   -- true = first application, false = resubmission
  submission_count SMALLINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  actor        UUID;
  note_clean   TEXT;
  org_clean    TEXT;
  existing     RECORD;
  new_count    SMALLINT;
BEGIN
  actor := auth.uid();

  IF actor IS NULL THEN
    RAISE EXCEPTION 'nclex_tutor_submit_application: sign in to apply';
  END IF;

  -- Only the two self-serve doorways. An application can never claim to
  -- be an admin promotion or an invite: those are OUR acts, they carry an
  -- implicit approval (§5), and accepting either here would let somebody
  -- describe their own arrival as one we vouched for.
  IF p_source NOT IN ('SELF_APPLICATION', 'REGISTRATION') THEN
    RAISE EXCEPTION 'nclex_tutor_submit_application: % is not a self-serve source', p_source;
  END IF;

  org_clean  := NULLIF(btrim(COALESCE(p_organisation, '')), '');
  note_clean := NULLIF(btrim(COALESCE(p_request_note, '')), '');

  -- The note is what a vetting decision is actually made on, so an empty
  -- one is refused here as well as in the form. Organisation stays
  -- optional — plenty of good tutors are freelance.
  IF note_clean IS NULL THEN
    RAISE EXCEPTION 'nclex_tutor_submit_application: tell us about yourself';
  END IF;

  SELECT t.status, t.submission_count INTO existing
    FROM nclex_tutors t
   WHERE t.user_id = actor;

  IF NOT FOUND THEN
    -- ── First application ────────────────────────────────────────────
    INSERT INTO nclex_tutors (
      user_id, status, source, organisation, request_note,
      submission_count, first_applied_at, last_applied_at,
      decision_history
    ) VALUES (
      actor, 'PENDING', p_source, org_clean, note_clean,
      1, now(), now(),
      -- ⓘ `by` is NULL and `from` is NULL: an application is an act of
      -- the applicant, not a decision by an admin, and there was no
      -- prior status. Same shape as every other entry so the trail
      -- renderer needs no special case (§1d-i).
      jsonb_build_array(jsonb_build_object(
        'at', now(), 'by', NULL, 'from', NULL, 'to', 'PENDING', 'reason', NULL))
    );

    RETURN QUERY SELECT TRUE, 1::SMALLINT;
    RETURN;
  END IF;

  -- ── They already have a record ───────────────────────────────────────
  IF existing.status = 'SUSPENDED' THEN
    RAISE EXCEPTION 'nclex_tutor_submit_application: a suspended tutor cannot re-apply';
  END IF;

  IF existing.status = 'APPROVED' THEN
    RAISE EXCEPTION 'nclex_tutor_submit_application: you are already a tutor';
  END IF;

  IF existing.status = 'PENDING' THEN
    -- Not an error worth shouting about: a double submit, or a stale tab.
    -- Report the count they already have rather than inflating it.
    RETURN QUERY SELECT FALSE, existing.submission_count;
    RETURN;
  END IF;

  -- REJECTED → PENDING. The only re-application §9 allows, and the CHECK
  -- on status was written in 1a to permit exactly this.
  new_count := existing.submission_count + 1;

  UPDATE nclex_tutors t SET
    status           = 'PENDING',
    organisation     = org_clean,
    request_note     = note_clean,
    submission_count = new_count,
    last_applied_at  = now(),
    updated_at       = now(),
    -- ⚠ source is NOT rewritten. How this person first arrived is a fact
    -- about history; resubmitting does not change it.
    -- ⚠ decision_reason is NOT cleared either. §9 keeps it so the
    -- applicant can see what to fix, and the queue shows it beside the
    -- new submission as "here is what we said last time".
    decision_history = t.decision_history || jsonb_build_object(
                        'at', now(), 'by', NULL,
                        'from', t.status, 'to', 'PENDING', 'reason', NULL)
  WHERE t.user_id = actor;

  RETURN QUERY SELECT FALSE, new_count;
END;
$fn$;

GRANT EXECUTE ON FUNCTION nclex_tutor_submit_application(TEXT, TEXT, TEXT) TO authenticated;

-- ── Reading your own application ─────────────────────────────────────
-- Nothing new is needed: nclex_tutors_self_read already admits
-- `user_id = auth.uid()`, which is what lets the apply route show a
-- person their own status, their reason and their Request #N (§8). It is
-- also why 1d-i settled the trail's visibility as option (i) — reasons
-- are written knowing the subject will read them.

COMMENT ON FUNCTION nclex_tutor_submit_application(TEXT, TEXT, TEXT) IS
  'Tutor onboarding 2a-i. Submit or re-submit a tutor application for the '
  'CALLING user (auth.uid(); never a passed id). Inserts on first '
  'application, updates in place on re-application per §9. Refuses '
  'SUSPENDED (§6 — no laundering a suspension back into the queue) and '
  'APPROVED. Only ever writes status = PENDING; never approved_*, '
  'decided_* or decision_reason.';
