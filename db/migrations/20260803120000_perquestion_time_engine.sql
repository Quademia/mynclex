-- =========================================================
-- MyNclex — Per-question time engine (capture layer)
-- File: mynclex/db/migrations/20260803120000_perquestion_time_engine.sql
-- =========================================================
-- Populates nclex_attempt_answers.time_spent_sec — the column has existed
-- since slice 2.1 but was never written (the runner passed null; the
-- obsolete p_time_spent_sec submit-RPC param was dropped in
-- 20260509130000 because nothing computed it). This is the runner/attempt
-- level "per-question time engine" — bank practice, readiness sittings,
-- and future CAT all get honest per-question ENGAGED time; the readiness
-- results report is merely its first reader.
--
-- Design + rationale: bank-consumption-attempt-creation.html §6.3.2.
--
-- Three functions ship together:
--   1. nclex_add_answer_time — NEW. Additive per-question time flush from
--      the runner (one "+N seconds for item X" call per engaged segment).
--      Ensures a row exists so a read-then-skip question (engaged but never
--      answered → no answer row) still records its time: it inserts a
--      time-only placeholder (DRAFT + NULL answer). That NULL answer is the
--      sentinel the two finish paths key on.
--   2. nclex_complete_attempt — RECREATED. Adds a step that converts those
--      time-only placeholders to SKIPPED (they are genuine skips: engaged,
--      never answered), preserving time_spent_sec, before the existing
--      insert-a-SKIPPED-row-for-every-unreached-item step.
--   3. nclex_expire_attempt — RECREATED. Same conversion, back-dated to the
--      true deadline like the rest of that function.
--
-- The Server Action _flushDrafts (actions.ts) is updated in the same slice
-- to skip null-answer DRAFT rows so a placeholder is never promoted to
-- SUBMITTED. Order at finish: _flushDrafts (promotes real DRAFTs, skips
-- placeholders) → complete/expire (converts placeholders to SKIPPED,
-- inserts rows for never-touched items).
--
-- Additive-only w.r.t. schema (no table changes). The two recreated
-- functions differ from their prior bodies ONLY by the placeholder→SKIPPED
-- UPDATE; score aggregation + status flip are byte-for-byte unchanged.


-- =========================================================
-- 1. nclex_add_answer_time — additive per-question time flush
-- =========================================================
CREATE OR REPLACE FUNCTION nclex_add_answer_time(
  p_attempt_item_id UUID,
  p_delta_sec       INTEGER
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student    UUID := auth.uid();
  v_attempt_id UUID;
  v_owner      UUID;
  v_status     TEXT;
  v_duration   INTEGER;
  v_delta      INTEGER;
  v_now        TIMESTAMPTZ := NOW();
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- Nothing to bank for a non-positive delta.
  IF p_delta_sec IS NULL OR p_delta_sec <= 0 THEN
    RETURN;
  END IF;

  SELECT i.attempt_id, a.student_id, a.status, a.duration_seconds
  INTO   v_attempt_id, v_owner,     v_status, v_duration
  FROM nclex_attempt_items i
  JOIN nclex_attempts      a USING (attempt_id)
  WHERE i.attempt_item_id = p_attempt_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt item not found: %', p_attempt_item_id;
  END IF;

  IF v_owner <> v_student AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your attempt';
  END IF;

  -- Silent no-op once the attempt is terminal. Unlike save_progress (which
  -- raises), a late time-flush legitimately races the finish click — the
  -- runner fires flushActive() just before completeAttemptAction. Swallowing
  -- it keeps that race quiet rather than surfacing a spurious error.
  IF v_status <> 'IN_PROGRESS' THEN
    RETURN;
  END IF;

  -- Stuck-timer guard: a single engaged segment can't exceed the attempt's
  -- own wall-clock budget. Untimed attempts (duration NULL) get a generous
  -- 24h cap. Clamp, don't reject.
  v_delta := LEAST(p_delta_sec, COALESCE(v_duration, 86400));

  -- Additive upsert. For a question the student answered, save_progress has
  -- already created the row → we just add. For a read-then-skip question
  -- (engaged, never interacted → no row) we insert a time-only placeholder:
  -- DRAFT + NULL answer. ON CONFLICT covers the rare double-flush race on a
  -- never-answered item and updates an already-SUBMITTED row too (reading a
  -- rationale is still engaged time on that question).
  INSERT INTO nclex_attempt_answers (
    attempt_item_id, attempt_id, student_id,
    answer_json,     submission_status,
    time_spent_sec,  answer_changes_json
  ) VALUES (
    p_attempt_item_id, v_attempt_id, v_owner,
    NULL,              'DRAFT',
    v_delta,           '[]'::jsonb
  )
  ON CONFLICT (attempt_item_id) DO UPDATE
    SET time_spent_sec = COALESCE(nclex_attempt_answers.time_spent_sec, 0) + EXCLUDED.time_spent_sec,
        updated_at     = v_now;
END;
$$;


-- =========================================================
-- 2. nclex_complete_attempt — RECREATED (adds placeholder→SKIPPED convert)
-- =========================================================
CREATE OR REPLACE FUNCTION public.nclex_complete_attempt(p_attempt_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student      UUID := auth.uid();
  v_owner        UUID;
  v_status       TEXT;
  v_existing_fs  NUMERIC;
  v_final_score  NUMERIC;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT student_id, status, final_score
  INTO   v_owner,    v_status, v_existing_fs
  FROM nclex_attempts
  WHERE attempt_id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt not found: %', p_attempt_id;
  END IF;

  IF v_owner <> v_student AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your attempt';
  END IF;

  IF v_status <> 'IN_PROGRESS' THEN
    RETURN v_existing_fs;
  END IF;

  -- Time-only placeholders (DRAFT + NULL answer, created by
  -- nclex_add_answer_time for a read-then-skip question) are genuine skips:
  -- the student engaged but never answered. Convert to SKIPPED, preserving
  -- time_spent_sec, so review renders them and the one-terminal-row-per-item
  -- invariant holds. (_flushDrafts has already left these alone.)
  UPDATE nclex_attempt_answers
  SET submission_status = 'SKIPPED',
      is_correct        = FALSE,
      score_awarded     = 0,
      submitted_at      = NOW(),
      updated_at        = NOW()
  WHERE attempt_id = p_attempt_id
    AND submission_status = 'DRAFT'
    AND answer_json IS NULL;

  -- Parity with nclex_expire_attempt: every item the student never
  -- answered (and never even read) gets a terminal SKIPPED row.
  INSERT INTO nclex_attempt_answers (
    attempt_item_id, attempt_id, student_id,
    answer_json,     submission_status,
    is_correct,      score_awarded,
    submitted_at,    answer_changes_json
  )
  SELECT
    i.attempt_item_id, p_attempt_id, v_owner,
    NULL,              'SKIPPED',
    FALSE,             0,
    NOW(),             '[]'::jsonb
  FROM nclex_attempt_items i
  LEFT JOIN nclex_attempt_answers a ON a.attempt_item_id = i.attempt_item_id
  WHERE i.attempt_id = p_attempt_id
    AND a.answer_id IS NULL;

  SELECT AVG(COALESCE(ans.score_awarded, 0) / i.marks_snapshot)
  INTO v_final_score
  FROM nclex_attempt_items i
  LEFT JOIN nclex_attempt_answers ans
    ON ans.attempt_item_id = i.attempt_item_id
  WHERE i.attempt_id = p_attempt_id;

  IF v_final_score IS NULL THEN
    v_final_score := 0;
  END IF;

  UPDATE nclex_attempts
  SET status      = 'COMPLETED',
      ended_at    = NOW(),
      final_score = v_final_score,
      updated_at  = NOW()
  WHERE attempt_id = p_attempt_id;

  RETURN v_final_score;
END;
$function$;


-- =========================================================
-- 3. nclex_expire_attempt — RECREATED (adds placeholder→SKIPPED convert)
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

  IF v_started_at IS NULL OR v_duration IS NULL THEN
    RAISE EXCEPTION 'cannot expire untimed attempt %', p_attempt_id;
  END IF;

  IF NOW() < v_started_at + (v_duration || ' seconds')::INTERVAL THEN
    RAISE EXCEPTION 'timer has not yet expired';
  END IF;

  v_ended_at := v_started_at + (v_duration || ' seconds')::INTERVAL;

  -- Time-only placeholders → SKIPPED (see nclex_complete_attempt). Back-dated
  -- to the true deadline, matching the SKIPPED rows below.
  UPDATE nclex_attempt_answers
  SET submission_status = 'SKIPPED',
      is_correct        = FALSE,
      score_awarded     = 0,
      submitted_at      = v_ended_at,
      updated_at        = NOW()
  WHERE attempt_id = p_attempt_id
    AND submission_status = 'DRAFT'
    AND answer_json IS NULL;

  -- SKIPPED rows for items with no answer at all (the caller has already
  -- AUTO_SUBMITTED any DRAFT rows with a real answer by this point).
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

  SELECT AVG(COALESCE(ans.score_awarded, 0) / i.marks_snapshot)
  INTO v_final_score
  FROM nclex_attempt_items i
  LEFT JOIN nclex_attempt_answers ans ON ans.attempt_item_id = i.attempt_item_id
  WHERE i.attempt_id = p_attempt_id;

  IF v_final_score IS NULL THEN
    v_final_score := 0;
  END IF;

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
-- Grants
-- =========================================================
REVOKE EXECUTE ON FUNCTION nclex_add_answer_time(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION nclex_add_answer_time(UUID, INTEGER) TO authenticated;
