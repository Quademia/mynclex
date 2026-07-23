-- =========================================================
-- MyNclex — CAT: a timed-out exam gets a verdict
-- File: mynclex/db/migrations/20260813120000_cat_expire_with_verdict.sql
-- =========================================================
-- Plan: bank-consumption-cat.html §9.3, §9.4, §19.4.6.
--
-- THE DEFECT. checkTermination's TIME_LIMIT_HIT branch runs only inside a
-- turn, and a turn needs an answer to score. A time-out is exactly the case
-- with no answer. Meanwhile nclex_expire_attempt — the generic runner
-- expiry — fires the moment the countdown hits zero, is entirely mode-blind,
-- and writes none of the cat_* columns. It won every race, so TIME_LIMIT_HIT
-- was dead code and every CAT timeout produced no verdict at all.
--
-- Confirmed on dev attempt 4113c191: TIMED_OUT, 49 items, ended_at exactly
-- started_at + 4:00:00, cat_verdict / cat_final_theta / cat_final_se NULL.
--
-- This is the CAT counterpart of nclex_expire_attempt. The TS layer computes
-- theta / se / verdict (§10.6 — Rasch EAP is not something to write in SQL,
-- and §10.2 requires the same estimator the engine uses); this function
-- persists them and finalises the row.
--
-- TWO DELIBERATE DIFFERENCES FROM nclex_expire_attempt:
--
--   1. NO final_score. The engine's own terminal branch in cat_next_item does
--      not write one either, and §13.5 forbids ever showing a CAT a raw
--      score. Computing one anyway would leave a number in the database that
--      no surface is allowed to display — which is how it eventually leaks
--      onto one.
--
--   2. ended_at is BACK-DATED to started_at + duration_seconds, not NOW().
--      The exam ended when the clock ran out, not when we noticed. This
--      matters because the lazy detection path can fire arbitrarily later
--      (the student closes the laptop and opens it next week).
--
--      Note the asymmetry with cat_next_item, which stamps NOW() on its
--      TIME_LIMIT_HIT branch and is RIGHT to: that branch is reached because
--      an answer just landed, so "now" IS the moment the exam ended, and
--      back-dating there would place ended_at before that answer's
--      submitted_at.

CREATE OR REPLACE FUNCTION public.nclex_expire_cat_attempt(
  p_attempt_id         UUID,
  p_theta              NUMERIC,
  p_se                 NUMERIC,
  p_verdict            TEXT,
  p_items_administered INTEGER
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student    UUID := auth.uid();
  v_attempt    RECORD;
  v_ended_at   TIMESTAMPTZ;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_attempt FROM nclex_attempts WHERE attempt_id = p_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt not found: %', p_attempt_id;
  END IF;

  IF v_attempt.student_id <> v_student AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your attempt';
  END IF;

  IF v_attempt.mode <> 'CAT' THEN
    RAISE EXCEPTION 'not a CAT attempt: %', p_attempt_id;
  END IF;

  -- Idempotent, and the race guard. Whichever path lands first wins; this
  -- one simply reports the stored state rather than overwriting a verdict
  -- the engine may have just written from inside a turn.
  IF v_attempt.status <> 'IN_PROGRESS' THEN
    RETURN jsonb_build_object(
      'status',                 v_attempt.status,
      'already_terminal',       TRUE,
      'cat_verdict',            v_attempt.cat_verdict,
      'cat_items_administered', v_attempt.cat_items_administered);
  END IF;

  IF v_attempt.started_at IS NULL OR v_attempt.duration_seconds IS NULL THEN
    RAISE EXCEPTION 'cannot expire untimed attempt %', p_attempt_id;
  END IF;

  v_ended_at := v_attempt.started_at + (v_attempt.duration_seconds || ' seconds')::INTERVAL;

  IF NOW() < v_ended_at THEN
    RAISE EXCEPTION 'timer has not yet expired';
  END IF;

  -- Time-only placeholders -> SKIPPED, matching nclex_expire_attempt. These
  -- are rows the per-question time engine created to bank engaged time on a
  -- question that was read but never answered.
  UPDATE nclex_attempt_answers
  SET submission_status = 'SKIPPED',
      is_correct        = FALSE,
      score_awarded     = 0,
      submitted_at      = v_ended_at,
      updated_at        = NOW()
  WHERE attempt_id = p_attempt_id
    AND submission_status = 'DRAFT'
    AND answer_json IS NULL;

  -- A SKIPPED row for the live question the student never got to. In a CAT
  -- that is at most one item (the exam serves one at a time), but the set
  -- form is used so a partially-snapshotted case block cannot strand a row
  -- without an answer.
  INSERT INTO nclex_attempt_answers (
    attempt_item_id, attempt_id, student_id,
    answer_json,     submission_status,
    is_correct,      score_awarded,
    submitted_at,    answer_changes_json
  )
  SELECT
    i.attempt_item_id, p_attempt_id,      v_attempt.student_id,
    NULL,              'SKIPPED',
    FALSE,             0,
    v_ended_at,        '[]'::jsonb
  FROM nclex_attempt_items i
  LEFT JOIN nclex_attempt_answers a ON a.attempt_item_id = i.attempt_item_id
  WHERE i.attempt_id = p_attempt_id
    AND a.answer_id IS NULL;

  UPDATE nclex_attempts
  SET status                 = 'TIMED_OUT',
      ended_at               = v_ended_at,
      cat_verdict            = p_verdict,
      cat_final_theta        = p_theta,
      cat_final_se           = p_se,
      cat_termination_reason = 'TIME_LIMIT_HIT',
      cat_items_administered = p_items_administered,
      updated_at             = NOW()
  WHERE attempt_id = p_attempt_id;

  RETURN jsonb_build_object(
    'status',                 'TIMED_OUT',
    'already_terminal',       FALSE,
    'cat_verdict',            p_verdict,
    'cat_items_administered', p_items_administered);
END;
$$;

GRANT EXECUTE ON FUNCTION public.nclex_expire_cat_attempt(UUID, NUMERIC, NUMERIC, TEXT, INTEGER)
  TO authenticated;
