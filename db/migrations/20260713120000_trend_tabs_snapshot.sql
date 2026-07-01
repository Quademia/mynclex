-- =========================================================
-- MyNclex — Trend rich multi-chart, Slice 3b: freeze chart tabs into
-- the attempt snapshot.
-- File: mynclex/db/migrations/20260713120000_trend_tabs_snapshot.sql
-- Depends on: nclex_trend_tabs (Slice 1), nclex_create_attempt,
--             nclex_attempt_trend_snapshots.
-- =========================================================
-- The student runner reads a frozen snapshot, not live data. Trend
-- snapshots froze only the flat grid (timepoints/rows); this adds the
-- chart tabs so the runner can render the multi-chart stimulus — the
-- mirror of how nclex_attempt_case_snapshots already freezes case tabs.
--
-- Additive + back-compatible: the new column defaults to '[]', so
-- legacy trends with no tabs snapshot as an empty array and the runner
-- falls back to the flat grid until Slice 4 migrates them.
-- =========================================================

-- 1. Snapshot column — one frozen copy of the dataset's chart tabs.
ALTER TABLE nclex_attempt_trend_snapshots
  ADD COLUMN tabs_snapshot_json JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Re-create nclex_create_attempt with the trend-snapshot INSERT
--    extended to freeze the chart tabs (jsonb_agg from nclex_trend_tabs,
--    ordered by display_order — same shape as the case-tab freeze in the
--    CASE branch below it). Everything else is unchanged.
CREATE OR REPLACE FUNCTION public.nclex_create_attempt(
  p_filters jsonb,
  p_mode text,
  p_intent text,
  p_requested_count integer,
  p_source text DEFAULT 'CUSTOM_BUILT'::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student      UUID := auth.uid();
  v_attempt_id   UUID;
  v_max_possible INTEGER;
  v_running      INTEGER := 0;
  v_position     INTEGER := 0;
  v_actual_units INTEGER := 0;
  r_unit         RECORD;
  r_child        RECORD;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_source <> 'CUSTOM_BUILT' THEN
    RAISE EXCEPTION 'only CUSTOM_BUILT source supported in v1 (got %)', p_source;
  END IF;

  -- Bank entitlement gate (Slice 5.6).
  IF NOT (nclex_user_has_role('SUPER_ADMIN') OR nclex_has_active_bank_access(v_student)) THEN
    RAISE EXCEPTION 'active bank subscription required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_requested_count IS NULL OR p_requested_count < 5 OR p_requested_count > 150 THEN
    RAISE EXCEPTION 'requested_count out of range (5..150): %', p_requested_count;
  END IF;

  WITH expanded AS (
    SELECT 1 FROM _nclex_eligible_unit_pool(v_student, p_filters) p
    JOIN nclex_bank_items bi ON bi.item_id = p.unit_id
    WHERE p.unit_type = 'QUESTION'
    UNION ALL
    SELECT 1 FROM _nclex_eligible_unit_pool(v_student, p_filters) p
    JOIN nclex_case_study_items csi ON csi.case_id = p.unit_id
    WHERE p.unit_type = 'CASE'
  )
  SELECT COUNT(*) INTO v_max_possible FROM expanded;

  IF v_max_possible < p_requested_count - 3 THEN
    RAISE EXCEPTION 'only % questions match these filters; reduce count or loosen filters', v_max_possible;
  END IF;

  IF p_mode = 'CAT' THEN
    RAISE EXCEPTION 'CAT attempts use a separate creation path (slice 3.x)';
  END IF;

  INSERT INTO nclex_attempts (
    student_id, source, intent, mode, filters_json,
    requested_question_count, actual_question_count, actual_unit_count
  ) VALUES (
    v_student, p_source, p_intent, p_mode,
    COALESCE(p_filters, '{}'::jsonb),
    p_requested_count, 0, 0
  )
  RETURNING attempt_id INTO v_attempt_id;

  FOR r_unit IN
    WITH pool AS (
      SELECT unit_type, unit_id,
             CASE unit_type WHEN 'CASE' THEN 6 ELSE 1 END AS slot_cost,
             random() AS rnd
      FROM _nclex_eligible_unit_pool(v_student, p_filters)
    )
    SELECT unit_type, unit_id, slot_cost FROM pool ORDER BY rnd
  LOOP
    IF v_running >= p_requested_count THEN
      EXIT;
    END IF;
    IF v_running + r_unit.slot_cost > p_requested_count + 3 THEN
      CONTINUE;
    END IF;

    IF r_unit.unit_type = 'QUESTION' THEN
      INSERT INTO nclex_attempt_trend_snapshots (
        attempt_id, trend_id, title_snapshot, scenario_snapshot,
        kind_snapshot, row_label_snapshot, timepoints_snapshot_json, rows_snapshot_json,
        tabs_snapshot_json
      )
      SELECT v_attempt_id, td.trend_id, td.title, td.scenario,
             td.kind, td.row_label,
             COALESCE(td.timepoints, '[]'::jsonb),
             COALESCE(td.rows, '[]'::jsonb),
             COALESCE(
               (SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.display_order)
                FROM nclex_trend_tabs t
                WHERE t.trend_id = td.trend_id),
               '[]'::jsonb
             )
      FROM nclex_bank_items bi
      JOIN nclex_trend_datasets td ON td.trend_id = bi.trend_id
      WHERE bi.item_id = r_unit.unit_id AND bi.trend_id IS NOT NULL
      ON CONFLICT (attempt_id, trend_id) DO NOTHING;

      v_position := v_position + 1;
      INSERT INTO nclex_attempt_items (
        attempt_id, position, item_id, item_source,
        selection_unit_type, selection_unit_id,
        trend_id,
        question_type, stem_snapshot, instruction_snapshot,
        rationale_snapshot, rationale_img_snapshot,
        marks_snapshot, classification_snapshot,
        content_snapshot_json, correct_answer_snapshot_json,
        option_order_json
      )
      SELECT
        v_attempt_id, v_position, bi.item_id, 'BANK',
        'QUESTION', bi.item_id,
        bi.trend_id,
        bi.question_type, bi.stem, bi.instruction,
        bi.rationale, bi.rationale_img,
        COALESCE(bi.marks, 1), jsonb_build_object(
          'client_needs_category',    bi.client_needs_category,
          'client_needs_subcategory', bi.client_needs_subcategory,
          'nursing_subject',          bi.nursing_subject,
          'body_system',              bi.body_system,
          'topic',                    bi.topic,
          'subtopic',                 bi.subtopic,
          'difficulty',               bi.difficulty,
          'tags',                     to_jsonb(bi.tags)
        ),
        COALESCE(bi.content, '{}'::jsonb),
        COALESCE(bi.correct, '{}'::jsonb),
        '{}'::jsonb
      FROM nclex_bank_items bi WHERE bi.item_id = r_unit.unit_id;

      v_running := v_running + 1;

    ELSIF r_unit.unit_type = 'CASE' THEN
      INSERT INTO nclex_attempt_case_snapshots (
        attempt_id, case_id, title_snapshot, scenario_summary_snapshot, tabs_snapshot_json
      )
      SELECT
        v_attempt_id, cs.case_id, cs.title, cs.scenario_summary,
        COALESCE(
          (SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.display_order)
           FROM nclex_case_study_tabs t
           WHERE t.case_id = cs.case_id),
          '[]'::jsonb
        )
      FROM nclex_case_studies cs WHERE cs.case_id = r_unit.unit_id;

      FOR r_child IN
        SELECT csi.position AS case_position, csi.cjmm_step, bi.*
        FROM nclex_case_study_items csi
        JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
        WHERE csi.case_id = r_unit.unit_id
        ORDER BY csi.position
      LOOP
        v_position := v_position + 1;
        INSERT INTO nclex_attempt_items (
          attempt_id, position, item_id, item_source,
          selection_unit_type, selection_unit_id,
          parent_case_id, case_position, cjmm_step,
          trend_id,
          question_type, stem_snapshot, instruction_snapshot,
          rationale_snapshot, rationale_img_snapshot,
          marks_snapshot, classification_snapshot,
          content_snapshot_json, correct_answer_snapshot_json,
          option_order_json
        ) VALUES (
          v_attempt_id, v_position, r_child.item_id, 'BANK',
          'CASE', r_unit.unit_id,
          r_unit.unit_id, r_child.case_position, r_child.cjmm_step,
          r_child.trend_id,
          r_child.question_type, r_child.stem, r_child.instruction,
          r_child.rationale, r_child.rationale_img,
          COALESCE(r_child.marks, 1),
          jsonb_build_object(
            'client_needs_category',    r_child.client_needs_category,
            'client_needs_subcategory', r_child.client_needs_subcategory,
            'nursing_subject',          r_child.nursing_subject,
            'body_system',              r_child.body_system,
            'topic',                    r_child.topic,
            'subtopic',                 r_child.subtopic,
            'difficulty',               r_child.difficulty,
            'tags',                     to_jsonb(r_child.tags)
          ),
          COALESCE(r_child.content, '{}'::jsonb),
          COALESCE(r_child.correct, '{}'::jsonb),
          '{}'::jsonb
        );
      END LOOP;

      v_running := v_running + 6;
    END IF;

    v_actual_units := v_actual_units + 1;
  END LOOP;

  IF v_running < p_requested_count - 3 THEN
    RAISE EXCEPTION 'pool too small to satisfy requested count: produced %, needed at least %',
      v_running, p_requested_count - 3;
  END IF;

  UPDATE nclex_attempts
  SET actual_question_count = v_running,
      actual_unit_count     = v_actual_units,
      updated_at            = NOW()
  WHERE attempt_id = v_attempt_id;

  RETURN v_attempt_id;
END;
$function$;
