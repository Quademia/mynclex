-- =========================================================
-- MyNclex — Slice 4.5a: Save-progress + Expire-attempt RPCs
-- File: mynclex/db/migrations/20260509120000_slice_4_5a_save_progress_and_expire.sql
-- =========================================================
-- Two RPCs that ship together as the foundation of slice 4.5a:
--
-- 1. nclex_save_progress(attempt_item_id, answer_json)
--    Persists every material answer change as a DRAFT row +
--    appends a {at, from, to} entry to answer_changes_json. The
--    runner calls this on every option toggle / blank commit
--    (debounced ~500ms client-side per runner.html §9.1) so the
--    server has the latest pending state at all times. Replaces
--    the original "STUDY-only save_progress, deferred to slice 4.6"
--    plan with a universal save-on-tap path used by all 7 active
--    tuples — see runner.html §9.1.
--
-- 2. nclex_expire_attempt(attempt_id)
--    Single-attempt timeout (lazy detection version of the cron
--    sweep deferred in slice 2.4). Caller (Server Action) is
--    responsible for first iterating any DRAFT rows, scoring
--    each in TS via lib/scoring/scoreAttempt, and calling the
--    existing nclex_submit_answer with submission_status =
--    'AUTO_SUBMITTED'. This RPC then handles the remainder:
--      • inserts SKIPPED rows for items with no answer at all
--      • computes final_score (item-equivalent average per
--        bank-marks-and-scoring.html §7)
--      • flips status to TIMED_OUT with
--        ended_at = started_at + duration_seconds (true expiry,
--        not the detection moment, per attempt-creation §6.1.3)
--    Idempotent: returns the existing final_score on re-call.
--
-- Source of truth:
--   docs/product-plan/bank-consumption-runner.html §8.6, §9.1, §13
--   docs/product-plan/bank-consumption-attempt-creation.html §6.1.3, §6.3.1, §6.3.3


-- =========================================================
-- 1. nclex_save_progress
-- =========================================================
CREATE OR REPLACE FUNCTION nclex_save_progress(
  p_attempt_item_id UUID,
  p_answer_json     JSONB
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student          UUID := auth.uid();
  v_attempt_id       UUID;
  v_owner            UUID;
  v_status           TEXT;
  v_existing_status  TEXT;
  v_existing_answer  JSONB;
  v_existing_changes JSONB;
  v_now              TIMESTAMPTZ := NOW();
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- Resolve attempt + item in one go.
  SELECT i.attempt_id, a.student_id, a.status
  INTO   v_attempt_id, v_owner,     v_status
  FROM nclex_attempt_items i
  JOIN nclex_attempts      a USING (attempt_id)
  WHERE i.attempt_item_id = p_attempt_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt item not found: %', p_attempt_item_id;
  END IF;

  IF v_owner <> v_student AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your attempt';
  END IF;

  IF v_status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'attempt is %, cannot save progress', v_status;
  END IF;

  -- Existing-row handling. UNIQUE on attempt_item_id means at most one row.
  SELECT submission_status, answer_json, answer_changes_json
  INTO   v_existing_status, v_existing_answer, v_existing_changes
  FROM nclex_attempt_answers
  WHERE attempt_item_id = p_attempt_item_id;

  IF v_existing_status IS NULL THEN
    -- First save for this item: insert DRAFT row with the initial
    -- changes log entry {at, from: null, to: answer}.
    INSERT INTO nclex_attempt_answers (
      attempt_item_id, attempt_id, student_id,
      answer_json,     submission_status,
      answer_changes_json
    ) VALUES (
      p_attempt_item_id, v_attempt_id, v_owner,
      p_answer_json,     'DRAFT',
      jsonb_build_array(jsonb_build_object(
        'at',   v_now,
        'from', NULL,
        'to',   p_answer_json
      ))
    );

  ELSIF v_existing_status = 'DRAFT' THEN
    -- Subsequent save on a still-DRAFT row: append to the changes log
    -- only when the answer actually changed (per §6.3.3 "every material
    -- change"). No-op when same — defensive against debounce edge cases
    -- that fire the RPC with an unchanged value.
    IF v_existing_answer IS DISTINCT FROM p_answer_json THEN
      UPDATE nclex_attempt_answers
      SET answer_json         = p_answer_json,
          answer_changes_json = v_existing_changes || jsonb_build_array(
            jsonb_build_object(
              'at',   v_now,
              'from', v_existing_answer,
              'to',   p_answer_json
            )
          ),
          updated_at          = v_now
      WHERE attempt_item_id = p_attempt_item_id;
    END IF;

  ELSE
    -- SUBMITTED / AUTO_SUBMITTED / SKIPPED — already final. The client
    -- should never call save-on-tap for a finalised row (per-item mode
    -- flips to review once a submission row exists). Surface as an
    -- error so client-side bugs are visible.
    RAISE EXCEPTION 'answer already %, cannot save progress', v_existing_status;
  END IF;

  -- Heartbeat. last_activity_at drives orphan-cleanup detection
  -- (slice 2.4) and the EXAM re-entry detection threshold per
  -- attempt-creation §6.1.3 (60s inactivity = treat as re-entry).
  UPDATE nclex_attempts
  SET last_activity_at = v_now,
      updated_at       = v_now
  WHERE attempt_id = v_attempt_id;
END;
$$;


-- =========================================================
-- 2. nclex_expire_attempt
-- =========================================================
CREATE OR REPLACE FUNCTION nclex_expire_attempt(p_attempt_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student      UUID := auth.uid();
  v_owner        UUID;
  v_status       TEXT;
  v_started_at   TIMESTAMPTZ;
  v_duration     INTEGER;
  v_ended_at     TIMESTAMPTZ;
  v_existing_fs  NUMERIC;
  v_final_score  NUMERIC;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT student_id, status, started_at, duration_seconds, final_score
  INTO   v_owner,    v_status, v_started_at, v_duration, v_existing_fs
  FROM nclex_attempts
  WHERE attempt_id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt not found: %', p_attempt_id;
  END IF;

  IF v_owner <> v_student AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your attempt';
  END IF;

  -- Idempotent: already terminal returns the stored final_score.
  IF v_status <> 'IN_PROGRESS' THEN
    RETURN v_existing_fs;
  END IF;

  -- Only timed attempts can expire via this path. The cron sweep
  -- (slice 2.4) handles the orphan-cleanup case for stale untimed
  -- attempts — that's a different motion.
  IF v_started_at IS NULL OR v_duration IS NULL THEN
    RAISE EXCEPTION 'cannot expire untimed attempt %', p_attempt_id;
  END IF;

  -- Defensive: server-side timer-expiry check. The caller (Server Action
  -- triggered by lazy detection in page.tsx, or the client-side countdown
  -- hitting zero) should already verify this, but the RPC enforces too.
  IF NOW() < v_started_at + (v_duration || ' seconds')::INTERVAL THEN
    RAISE EXCEPTION 'timer has not yet expired';
  END IF;

  v_ended_at := v_started_at + (v_duration || ' seconds')::INTERVAL;

  -- SKIPPED rows for items with no answer at all (the caller has
  -- already AUTO_SUBMITTED any DRAFT rows by this point). score=0,
  -- is_correct=FALSE, answer_json=NULL, submitted_at=ended_at.
  INSERT INTO nclex_attempt_answers (
    attempt_item_id, attempt_id, student_id,
    answer_json,     submission_status,
    is_correct,      score_awarded,
    submitted_at,    answer_changes_json
  )
  SELECT
    i.attempt_item_id, p_attempt_id,    v_owner,
    NULL,              'SKIPPED',
    FALSE,             0,
    v_ended_at,        '[]'::jsonb
  FROM nclex_attempt_items i
  LEFT JOIN nclex_attempt_answers a ON a.attempt_item_id = i.attempt_item_id
  WHERE i.attempt_id = p_attempt_id
    AND a.answer_id IS NULL;

  -- Final-score: item-equivalent average across all rows. Mirrors
  -- nclex_complete_attempt's formula (bank-marks-and-scoring.html §7).
  -- LEFT JOIN catches any items that still don't have a row (shouldn't
  -- happen after the SKIPPED INSERT above, but defensive).
  SELECT AVG(COALESCE(ans.score_awarded, 0) / i.marks_snapshot)
  INTO v_final_score
  FROM nclex_attempt_items i
  LEFT JOIN nclex_attempt_answers ans ON ans.attempt_item_id = i.attempt_item_id
  WHERE i.attempt_id = p_attempt_id;

  IF v_final_score IS NULL THEN
    v_final_score := 0;
  END IF;

  -- Flip to TIMED_OUT. ended_at is the true expiry (started_at +
  -- duration), NOT the detection moment, per attempt-creation §6.1.3.
  UPDATE nclex_attempts
  SET status      = 'TIMED_OUT',
      ended_at    = v_ended_at,
      final_score = v_final_score,
      updated_at  = NOW()
  WHERE attempt_id = p_attempt_id;

  RETURN v_final_score;
END;
$$;


-- =========================================================
-- Grants — see slice 2.2a header for why PUBLIC + anon must both be
-- explicitly revoked on Supabase.
-- =========================================================
REVOKE EXECUTE ON FUNCTION nclex_save_progress(UUID, JSONB)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION nclex_expire_attempt(UUID)        FROM PUBLIC, anon;

GRANT  EXECUTE ON FUNCTION nclex_save_progress(UUID, JSONB)  TO authenticated;
GRANT  EXECUTE ON FUNCTION nclex_expire_attempt(UUID)        TO authenticated;
