-- 20260801120000_complete_attempt_skipped_rows.sql
--
-- Fix: a deliberately-finished attempt left its unreached questions with
-- NO answer row, so review mode couldn't render them (they showed a stuck
-- "Loading review data…" stub). The timer-expiry path
-- (nclex_expire_attempt) already inserts a SKIPPED row for every
-- unanswered item; the deliberate-finish path (nclex_complete_attempt)
-- did not. This brings the two paths to parity so a terminal attempt
-- ALWAYS has exactly one answer row per item, however it ended.
--
-- Only change vs the prior body: the SKIPPED-row INSERT block, lifted
-- from nclex_expire_attempt, with submitted_at = NOW() (a deliberate
-- finish ends "now", unlike expiry which back-dates to the true deadline).
-- Score aggregation + status flip are unchanged (the LEFT JOIN already
-- treated missing rows as zero, so final_score was — and stays — correct).

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

  -- Parity with nclex_expire_attempt: every item the student never
  -- answered gets a terminal SKIPPED row, so review renders every
  -- question and downstream reads see one row per item.
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
