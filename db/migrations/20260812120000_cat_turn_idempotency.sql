-- =========================================================
-- MyNclex — CAT: turn idempotency guard
-- File: mynclex/db/migrations/20260812120000_cat_turn_idempotency.sql
-- =========================================================
-- Plan: bank-consumption-cat.html §19.4.4.
--
-- WHY. cat_next_item assumed the newest attempt_item is always the one being
-- answered. True on the happy path, FALSE on a retry: if the server commits
-- and the response is lost (dropped connection, phone sleeping), the newest
-- item is by then the NEW, unanswered question. A retry would record the OLD
-- answer against it and serve a third — marking a student on a question they
-- never saw. Over 150 turns on mobile data, that will happen.
--
-- The caller now passes the attempt_item_id it believes it is answering. If
-- that is not the newest item the turn already landed, so return the current
-- state instead of advancing. This is also what makes a Retry button safe
-- (§10.1, the 10s+ layer, slice 6c).
--
-- p_expected_item_id defaults NULL = skip the check, so older callers work.
--
-- OVERLOAD TRAP. Adding a DEFAULTed parameter CREATES A NEW FUNCTION rather
-- than replacing the old one — Postgres overloads on signature. Without the
-- drops below the database ends up holding three cat_next_item signatures
-- (the Slice 1 stub, the Slice 4/5 body, and this), and an 8-argument call
-- becomes ambiguous. Drop first, then create.

DROP FUNCTION IF EXISTS public.cat_next_item(UUID, JSONB, NUMERIC, BOOLEAN, NUMERIC, NUMERIC);
DROP FUNCTION IF EXISTS public.cat_next_item(UUID, JSONB, NUMERIC, BOOLEAN, NUMERIC, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.cat_next_item(
  p_attempt_id UUID, p_last_answer_payload JSONB, p_score_awarded NUMERIC,
  p_is_correct BOOLEAN, p_theta_after NUMERIC, p_se_after NUMERIC,
  p_terminate_reason TEXT DEFAULT NULL, p_terminate_verdict TEXT DEFAULT NULL,
  p_expected_item_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_student UUID := auth.uid();
  v_attempt RECORD; v_current RECORD; v_position INTEGER; v_item RECORD;
  v_relaxed BOOLEAN := FALSE; v_under TEXT; v_case_pos INTEGER[];
  v_case_id TEXT; v_child_pos INTEGER; v_weight NUMERIC := 1.0;
  v_unit_type TEXT := 'QUESTION'; v_unit_id TEXT; v_cjmm TEXT := NULL; v_parent_case TEXT := NULL;
BEGIN
  IF v_student IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_attempt FROM nclex_attempts
  WHERE attempt_id = p_attempt_id AND student_id = v_student;
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt not found' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF v_attempt.mode <> 'CAT' THEN RAISE EXCEPTION 'not a CAT attempt: %', p_attempt_id; END IF;
  IF v_attempt.status <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'attempt is already %', v_attempt.status; END IF;

  SELECT * INTO v_current FROM nclex_attempt_items
  WHERE attempt_id = p_attempt_id ORDER BY position DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt has no administered item'; END IF;

  -- Idempotency: the turn already landed, so re-serve the current state
  -- rather than answering the NEW question with the OLD answer.
  IF p_expected_item_id IS NOT NULL AND v_current.attempt_item_id <> p_expected_item_id THEN
    RETURN jsonb_build_object('status','CONTINUE','replayed', TRUE, 'exposure_relaxed', FALSE,
      'next_item_payload', jsonb_build_object(
        'attempt_item_id', v_current.attempt_item_id, 'position', v_current.position,
        'item_id', v_current.item_id, 'question_type', v_current.question_type,
        'difficulty_irt', v_current.cat_item_difficulty,
        'parent_case_id', v_current.parent_case_id, 'case_position', v_current.case_position,
        'cat_weight', v_current.cat_weight));
  END IF;

  INSERT INTO nclex_attempt_answers (
    attempt_id, attempt_item_id, student_id, answer_json,
    submission_status, score_awarded, is_correct, submitted_at
  ) VALUES (
    p_attempt_id, v_current.attempt_item_id, v_student,
    COALESCE(p_last_answer_payload, '{}'::jsonb), 'SUBMITTED', p_score_awarded, p_is_correct, NOW()
  ) ON CONFLICT (attempt_item_id) DO UPDATE
    SET answer_json = EXCLUDED.answer_json, score_awarded = EXCLUDED.score_awarded,
        is_correct = EXCLUDED.is_correct, submitted_at = EXCLUDED.submitted_at,
        submission_status = EXCLUDED.submission_status, updated_at = NOW();
        -- answer_changes_json deliberately untouched: it is the
        -- second-guessing log the results report reads.

  UPDATE nclex_attempts SET last_activity_at = NOW(), updated_at = NOW() WHERE attempt_id = p_attempt_id;

  IF p_terminate_reason IS NOT NULL THEN
    UPDATE nclex_attempts
    SET status = CASE WHEN p_terminate_reason = 'TIME_LIMIT_HIT' THEN 'TIMED_OUT' ELSE 'COMPLETED' END,
        ended_at = NOW(), cat_verdict = p_terminate_verdict,
        cat_final_theta = p_theta_after, cat_final_se = p_se_after,
        cat_termination_reason = p_terminate_reason,
        cat_items_administered = (SELECT COUNT(*) FROM nclex_attempt_items WHERE attempt_id = p_attempt_id),
        updated_at = NOW()
    WHERE attempt_id = p_attempt_id;
    RETURN jsonb_build_object('status','COMPLETE','verdict_payload', jsonb_build_object(
      'verdict', p_terminate_verdict, 'final_theta', p_theta_after, 'final_se', p_se_after,
      'termination_reason', p_terminate_reason,
      'items_administered', (SELECT COUNT(*) FROM nclex_attempt_items WHERE attempt_id = p_attempt_id)));
  END IF;

  v_position := v_current.position + 1;
  v_case_pos := nclex_cat_case_positions(p_attempt_id);

  -- Mid-case: serve the next child of the SAME case, in fixed CJMM order.
  IF v_current.parent_case_id IS NOT NULL AND v_current.case_position < 6 THEN
    v_case_id := v_current.parent_case_id;
    v_child_pos := v_current.case_position + 1;
    SELECT bi.*, csi.cjmm_step AS csi_step INTO v_item
    FROM nclex_case_study_items csi JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
    WHERE csi.case_id = v_case_id AND csi.position = v_child_pos;
    IF NOT FOUND THEN RAISE EXCEPTION 'case % has no child at position %', v_case_id, v_child_pos; END IF;
    v_weight := 0.5; v_unit_type := 'CASE'; v_unit_id := v_case_id;
    v_parent_case := v_case_id; v_cjmm := v_item.csi_step;

  -- Scheduled case slot: start a new case (NOT difficulty-matched, §7.4).
  ELSIF v_position = ANY(v_case_pos) THEN
    WITH last3 AS (
      SELECT attempt_id FROM nclex_attempts
      WHERE student_id = v_student AND mode = 'CAT' AND started_at IS NOT NULL
      ORDER BY started_at DESC LIMIT 3
    ), seen_cases AS (
      SELECT DISTINCT ai.parent_case_id AS case_id FROM nclex_attempt_items ai
      JOIN last3 ON last3.attempt_id = ai.attempt_id WHERE ai.parent_case_id IS NOT NULL
      UNION
      SELECT DISTINCT ai.parent_case_id FROM nclex_attempt_items ai
      WHERE ai.attempt_id = p_attempt_id AND ai.parent_case_id IS NOT NULL
    )
    SELECT cs.case_id INTO v_case_id FROM nclex_case_studies cs
    WHERE cs.is_published IS TRUE
      AND NOT EXISTS (SELECT 1 FROM seen_cases sc WHERE sc.case_id = cs.case_id)
      AND (SELECT COUNT(*) FROM nclex_case_study_items csi
           JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
           WHERE csi.case_id = cs.case_id AND bi.is_published IS TRUE
             AND bi.difficulty_irt IS NOT NULL) = 6
    ORDER BY random() LIMIT 1;

    IF v_case_id IS NOT NULL THEN
      INSERT INTO nclex_attempt_case_snapshots (
        attempt_id, case_id, title_snapshot, scenario_summary_snapshot, tabs_snapshot_json)
      SELECT p_attempt_id, cs.case_id, cs.title, cs.scenario_summary,
             COALESCE((SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.display_order)
                       FROM nclex_case_study_tabs t WHERE t.case_id = cs.case_id), '[]'::jsonb)
      FROM nclex_case_studies cs WHERE cs.case_id = v_case_id
      ON CONFLICT (attempt_id, case_id) DO NOTHING;

      SELECT bi.*, csi.cjmm_step AS csi_step INTO v_item
      FROM nclex_case_study_items csi JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
      WHERE csi.case_id = v_case_id AND csi.position = 1;

      v_weight := 0.5; v_unit_type := 'CASE'; v_unit_id := v_case_id;
      v_parent_case := v_case_id; v_cjmm := v_item.csi_step;
    END IF;
    -- No eligible case: the slot degrades to a standalone pick below. A
    -- missing case must never stall the exam.
  END IF;

  -- Ordinary adaptive pick: nearest-neighbour difficulty (§7.1) + the §8.1
  -- category tiebreaker among items tied at that distance.
  IF v_case_id IS NULL THEN
    SELECT cat INTO v_under FROM (
      SELECT c.cat, COUNT(ai.attempt_item_id) AS n
      FROM (VALUES ('Safe and Effective Care Environment'),('Health Promotion and Maintenance'),
                   ('Psychosocial Integrity'),('Physiological Integrity')) AS c(cat)
      LEFT JOIN nclex_attempt_items ai ON ai.attempt_id = p_attempt_id
        AND ai.classification_snapshot->>'client_needs_category' = c.cat
      GROUP BY c.cat ORDER BY n ASC, c.cat LIMIT 1) least_served;

    WITH last3 AS (
      SELECT attempt_id FROM nclex_attempts
      WHERE student_id = v_student AND mode = 'CAT' AND started_at IS NOT NULL
      ORDER BY started_at DESC LIMIT 3
    ), seen AS (
      SELECT DISTINCT ai.item_id FROM nclex_attempt_items ai
      JOIN last3 ON last3.attempt_id = ai.attempt_id
    ), used_trends AS (
      SELECT DISTINCT ai.trend_id FROM nclex_attempt_items ai
      WHERE ai.attempt_id = p_attempt_id AND ai.trend_id IS NOT NULL
    ), eligible AS (
      SELECT bi.*, abs(bi.difficulty_irt - p_theta_after) AS dist
      FROM nclex_bank_items bi
      WHERE bi.is_published IS TRUE AND bi.is_builder_visible IS TRUE
        AND bi.difficulty_irt IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM nclex_case_study_items csi WHERE csi.item_id = bi.item_id)
        AND (bi.trend_id IS NULL OR NOT EXISTS (SELECT 1 FROM used_trends ut WHERE ut.trend_id = bi.trend_id))
        AND NOT EXISTS (SELECT 1 FROM nclex_attempt_items ai
                        WHERE ai.attempt_id = p_attempt_id AND ai.item_id = bi.item_id)
        AND NOT EXISTS (SELECT 1 FROM seen WHERE seen.item_id = bi.item_id)
    )
    SELECT * INTO v_item FROM eligible WHERE dist = (SELECT MIN(dist) FROM eligible)
    ORDER BY (client_needs_category IS DISTINCT FROM v_under), random() LIMIT 1;

    -- §7.5 fallback: relax EXPOSURE before difficulty. Difficulty match is
    -- sacred; a cross-attempt repeat is the lesser harm.
    IF NOT FOUND THEN
      v_relaxed := TRUE;
      WITH used_trends AS (
        SELECT DISTINCT ai.trend_id FROM nclex_attempt_items ai
        WHERE ai.attempt_id = p_attempt_id AND ai.trend_id IS NOT NULL
      ), eligible AS (
        SELECT bi.*, abs(bi.difficulty_irt - p_theta_after) AS dist
        FROM nclex_bank_items bi
        WHERE bi.is_published IS TRUE AND bi.is_builder_visible IS TRUE
          AND bi.difficulty_irt IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM nclex_case_study_items csi WHERE csi.item_id = bi.item_id)
          AND (bi.trend_id IS NULL OR NOT EXISTS (SELECT 1 FROM used_trends ut WHERE ut.trend_id = bi.trend_id))
          AND NOT EXISTS (SELECT 1 FROM nclex_attempt_items ai
                          WHERE ai.attempt_id = p_attempt_id AND ai.item_id = bi.item_id)
      )
      SELECT * INTO v_item FROM eligible WHERE dist = (SELECT MIN(dist) FROM eligible)
      ORDER BY (client_needs_category IS DISTINCT FROM v_under), random() LIMIT 1;
      IF NOT FOUND THEN RAISE EXCEPTION 'CAT pool exhausted at position %', v_position; END IF;
    END IF;

    v_unit_id := v_item.item_id; v_weight := 1.0;

    IF v_item.trend_id IS NOT NULL THEN
      INSERT INTO nclex_attempt_trend_snapshots (
        attempt_id, trend_id, title_snapshot, scenario_snapshot, tabs_snapshot_json)
      SELECT p_attempt_id, td.trend_id, td.title, td.scenario,
             COALESCE((SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.display_order)
                       FROM nclex_trend_tabs t WHERE t.trend_id = td.trend_id), '[]'::jsonb)
      FROM nclex_trend_datasets td WHERE td.trend_id = v_item.trend_id
      ON CONFLICT (attempt_id, trend_id) DO NOTHING;
    END IF;
  END IF;

  INSERT INTO nclex_attempt_items (
    attempt_id, position, item_id, item_source, selection_unit_type, selection_unit_id,
    parent_case_id, case_position, cjmm_step, trend_id,
    question_type, stem_snapshot, instruction_snapshot, rationale_snapshot, rationale_img_snapshot,
    marks_snapshot, classification_snapshot, content_snapshot_json, correct_answer_snapshot_json,
    option_order_json, cat_theta_before, cat_se_before,
    cat_item_difficulty, cat_item_difficulty_source, cat_weight
  ) VALUES (
    p_attempt_id, v_position, v_item.item_id, 'BANK', v_unit_type, v_unit_id,
    v_parent_case, CASE WHEN v_parent_case IS NOT NULL THEN COALESCE(v_child_pos, 1) END,
    v_cjmm, v_item.trend_id,
    v_item.question_type, v_item.stem, v_item.instruction, v_item.rationale, v_item.rationale_img,
    COALESCE(v_item.marks, 1),
    jsonb_build_object('client_needs_category', v_item.client_needs_category,
      'client_needs_subcategory', v_item.client_needs_subcategory,
      'nursing_subject', v_item.nursing_subject, 'body_system', v_item.body_system,
      'topic', v_item.topic, 'subtopic', v_item.subtopic,
      'difficulty', v_item.difficulty, 'tags', to_jsonb(v_item.tags)),
    COALESCE(v_item.content, '{}'::jsonb), COALESCE(v_item.correct, '{}'::jsonb), '{}'::jsonb,
    p_theta_after, p_se_after, v_item.difficulty_irt, v_item.difficulty_source, v_weight
  );

  UPDATE nclex_attempts
  SET actual_question_count = v_position,
      -- A case block is ONE unit however many children it has.
      actual_unit_count = (SELECT COUNT(DISTINCT COALESCE(parent_case_id, item_id))
                           FROM nclex_attempt_items WHERE attempt_id = p_attempt_id),
      updated_at = NOW()
  WHERE attempt_id = p_attempt_id;

  RETURN jsonb_build_object('status','CONTINUE','replayed', FALSE,'exposure_relaxed', v_relaxed,
    'next_item_payload', jsonb_build_object(
      'attempt_item_id', (SELECT attempt_item_id FROM nclex_attempt_items
                          WHERE attempt_id = p_attempt_id AND position = v_position),
      'position', v_position, 'item_id', v_item.item_id,
      'question_type', v_item.question_type, 'difficulty_irt', v_item.difficulty_irt,
      'parent_case_id', v_parent_case,
      'case_position', CASE WHEN v_parent_case IS NOT NULL THEN COALESCE(v_child_pos, 1) END,
      'cat_weight', v_weight));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cat_next_item(UUID, JSONB, NUMERIC, BOOLEAN, NUMERIC, NUMERIC, TEXT, TEXT, UUID)
  TO authenticated;
