-- 20260731120000_readiness_start_attempt.sql
--
-- Readiness step 2b-ii — starting a readiness sitting = spending the shot.
--
-- The generic nclex_mark_attempt_started only anchors the timer; it knows
-- nothing about credits. A readiness sitting must, at the SAME moment the
-- clock starts, spend the one-shot credit: stamp used_at + attempt_id onto
-- the pack's ACTIVE credit. The credits CHECK couples those two columns
-- (used_at IS NULL) = (attempt_id IS NULL), so they must be written together,
-- and it must be atomic with starting the clock — both or neither. Hence a
-- dedicated start function instead of two separate writes from the action.
--
-- "Starting the sitting IS the shot" (readiness-packs.md §2 r1): the credit is
-- untouched until this runs. Bouncing off the preflight costs nothing. The
-- window still governs whether you may start (§2 r3) — re-checked here at the
-- real commitment moment, blocking a deadline that slipped past before the
-- nightly sweep stamped expired_at.
--
-- Idempotent: a re-entry (connection loss) or double-submit on an
-- already-started attempt returns the existing started_at and spends nothing
-- more.

CREATE OR REPLACE FUNCTION public.nclex_start_readiness_attempt(p_attempt_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student UUID := auth.uid();
  v_owner   UUID;
  v_source  TEXT;
  v_pack    TEXT;
  v_status  TEXT;
  v_started TIMESTAMPTZ;
  v_credit  UUID;
  v_now     TIMESTAMPTZ := NOW();
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT student_id, source, readiness_pack_id, status, started_at
  INTO v_owner, v_source, v_pack, v_status, v_started
  FROM nclex_attempts
  WHERE attempt_id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt not found: %', p_attempt_id;
  END IF;
  IF v_owner <> v_student AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your attempt';
  END IF;
  IF v_source <> 'READINESS_PACK' THEN
    RAISE EXCEPTION 'not a readiness attempt: %', p_attempt_id;
  END IF;
  IF v_status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'attempt is %, cannot start', v_status;
  END IF;

  -- Already started — re-entry / double-submit. Idempotent, spend nothing.
  IF v_started IS NOT NULL THEN
    RETURN v_started;
  END IF;

  -- The ACTIVE credit for this pack (activated, not sat/lapsed/revoked, window
  -- still open). FOR UPDATE serialises a concurrent double-start on the row.
  SELECT credit_id INTO v_credit
  FROM nclex_readiness_credits
  WHERE user_id     = v_student
    AND pack_id     = v_pack
    AND activated_at IS NOT NULL
    AND used_at      IS NULL
    AND expired_at   IS NULL
    AND revoked_at   IS NULL
    AND expires_at   > v_now
  LIMIT 1
  FOR UPDATE;

  IF v_credit IS NULL THEN
    RAISE EXCEPTION 'no active readiness credit for this pack'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Spend the shot: used_at + attempt_id together (CHECK couples them).
  UPDATE nclex_readiness_credits
  SET used_at    = v_now,
      attempt_id = p_attempt_id,
      updated_at = v_now
  WHERE credit_id = v_credit;

  -- Start the clock.
  UPDATE nclex_attempts
  SET started_at       = v_now,
      last_activity_at = v_now,
      updated_at       = v_now
  WHERE attempt_id = p_attempt_id;

  RETURN v_now;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.nclex_start_readiness_attempt(uuid) TO authenticated;
