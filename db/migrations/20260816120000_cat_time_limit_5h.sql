-- mynclex/db/migrations/20260816120000_cat_time_limit_5h.sql
--
-- CAT time limit 4h → 5h (bank-consumption-cat.html §9.3, decided 2026-07-25).
--
-- Rationale: §9.2 sets 85/150 on "match real NCLEX exactly"; the clock is the
-- third dimension of the same envelope and should follow the same principle.
-- The real NCLEX gives 5 hours. A time limit is a ceiling, not a duration, so
-- a shorter one only ever cuts off a slow candidate — 5h is the kinder and the
-- more faithful number.
--
-- The runtime authority for an in-progress exam is the attempt row's
-- duration_seconds (checkTermination reads TerminationInput.timeLimitSeconds),
-- which is stamped here at creation. So this change applies to NEW CATs only;
-- any CAT already in progress keeps the 4h it was created under. Nothing is
-- back-filled.
--
-- The TS constant TIME_LIMIT_SECONDS (lib/cat/termination.ts) is moved to 5h
-- in the same change; a vitest guard keeps C_DURATION_SECONDS below in lockstep
-- with it (it now reads THIS migration file).
--
-- Only C_DURATION_SECONDS changes from 4*60*60 to 5*60*60; the rest of the
-- function body is identical to 20260809120000_cat_slice3_create_attempt.sql.

CREATE OR REPLACE FUNCTION public.create_cat_attempt(
  p_student_id uuid,
  p_intent     text,
  p_mode       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- 5 hours (§9.3, was 4) and the 150-item ceiling (§9.2).
  C_DURATION_SECONDS CONSTANT INTEGER := 5 * 60 * 60;
  C_MAX_ITEMS        CONSTANT INTEGER := 150;
  C_START_THETA      CONSTANT NUMERIC := 0.0;
  C_START_SE         CONSTANT NUMERIC := 1.0;
  v_student   UUID := auth.uid();
  v_attempt   UUID;
  v_existing  UUID;
  v_allowed   BOOLEAN;
  v_item      RECORD;
  v_relaxed   BOOLEAN := FALSE;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_student_id IS DISTINCT FROM v_student THEN
    RAISE EXCEPTION 'student_id does not match the authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_intent <> 'EXAM' OR p_mode <> 'CAT' THEN
    RAISE EXCEPTION 'create_cat_attempt only opens EXAM/CAT attempts (got %/%)', p_intent, p_mode;
  END IF;

  SELECT attempt_id INTO v_existing
  FROM nclex_attempts
  WHERE student_id = v_student AND mode = 'CAT' AND status = 'IN_PROGRESS'
  ORDER BY created_at DESC LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'attempt_id', v_existing, 'resumed', TRUE,
      'first_item_payload', (
        SELECT jsonb_build_object('attempt_item_id', ai.attempt_item_id, 'position', ai.position,
                                  'item_id', ai.item_id, 'question_type', ai.question_type)
        FROM nclex_attempt_items ai WHERE ai.attempt_id = v_existing
        ORDER BY ai.position DESC LIMIT 1));
  END IF;

  IF NOT nclex_has_active_bank_access(v_student) AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'active bank access required for CAT' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM nclex_subscriptions s
    WHERE s.user_id = v_student AND s.status = 'ACTIVE'
      AND s.pack_type IN ('BANK_DURATION', 'TRIAL')
      AND (s.end_at IS NULL OR s.end_at > NOW())
      AND (s.cat_allowance IS NULL
           OR (SELECT COUNT(*) FROM nclex_attempts a
               WHERE a.student_id = v_student AND a.mode = 'CAT'
                 AND a.started_at IS NOT NULL AND a.started_at >= s.started_at) < s.cat_allowance)
  ) INTO v_allowed;

  IF NOT v_allowed AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'CAT allowance exhausted for this subscription window'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH last3 AS (
    SELECT attempt_id FROM nclex_attempts
    WHERE student_id = v_student AND mode = 'CAT' AND started_at IS NOT NULL
    ORDER BY started_at DESC LIMIT 3
  ), seen AS (
    SELECT DISTINCT ai.item_id FROM nclex_attempt_items ai
    JOIN last3 ON last3.attempt_id = ai.attempt_id
  )
  SELECT bi.* INTO v_item
  FROM nclex_bank_items bi
  WHERE bi.is_published IS TRUE AND bi.is_builder_visible IS TRUE
    AND bi.difficulty_irt IS NOT NULL AND bi.trend_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM nclex_case_study_items csi WHERE csi.item_id = bi.item_id)
    AND NOT EXISTS (SELECT 1 FROM seen WHERE seen.item_id = bi.item_id)
  ORDER BY abs(bi.difficulty_irt - C_START_THETA), random() LIMIT 1;

  IF NOT FOUND THEN
    v_relaxed := TRUE;
    SELECT bi.* INTO v_item
    FROM nclex_bank_items bi
    WHERE bi.is_published IS TRUE AND bi.is_builder_visible IS TRUE
      AND bi.difficulty_irt IS NOT NULL AND bi.trend_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM nclex_case_study_items csi WHERE csi.item_id = bi.item_id)
    ORDER BY abs(bi.difficulty_irt - C_START_THETA), random() LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no CAT-eligible questions available';
    END IF;
  END IF;

  INSERT INTO nclex_attempts (
    student_id, source, intent, mode, duration_seconds, filters_json,
    requested_question_count, actual_question_count, actual_unit_count,
    started_at, cat_engine_version
  ) VALUES (
    v_student, 'CUSTOM_BUILT', 'EXAM', 'CAT', C_DURATION_SECONDS,
    jsonb_build_object('mode', 'CAT'), C_MAX_ITEMS, 1, 1,
    NOW(), nclex_cat_engine_version()
  ) RETURNING attempt_id INTO v_attempt;

  INSERT INTO nclex_attempt_items (
    attempt_id, position, item_id, item_source, selection_unit_type, selection_unit_id,
    question_type, stem_snapshot, instruction_snapshot, rationale_snapshot, rationale_img_snapshot,
    marks_snapshot, classification_snapshot, content_snapshot_json, correct_answer_snapshot_json,
    option_order_json, cat_theta_before, cat_se_before,
    cat_item_difficulty, cat_item_difficulty_source, cat_weight
  ) VALUES (
    v_attempt, 1, v_item.item_id, 'BANK', 'QUESTION', v_item.item_id,
    v_item.question_type, v_item.stem, v_item.instruction, v_item.rationale, v_item.rationale_img,
    COALESCE(v_item.marks, 1),
    jsonb_build_object(
      'client_needs_category', v_item.client_needs_category,
      'client_needs_subcategory', v_item.client_needs_subcategory,
      'nursing_subject', v_item.nursing_subject, 'body_system', v_item.body_system,
      'topic', v_item.topic, 'subtopic', v_item.subtopic,
      'difficulty', v_item.difficulty, 'tags', to_jsonb(v_item.tags)),
    COALESCE(v_item.content, '{}'::jsonb), COALESCE(v_item.correct, '{}'::jsonb), '{}'::jsonb,
    C_START_THETA, C_START_SE, v_item.difficulty_irt, v_item.difficulty_source, 1.0
  );

  RETURN jsonb_build_object(
    'attempt_id', v_attempt, 'resumed', FALSE, 'exposure_relaxed', v_relaxed,
    'first_item_payload', jsonb_build_object(
      'attempt_item_id', (SELECT attempt_item_id FROM nclex_attempt_items
                          WHERE attempt_id = v_attempt AND position = 1),
      'position', 1, 'item_id', v_item.item_id, 'question_type', v_item.question_type));
END;
$function$;
