-- =========================================================
-- MyNclex — Filter breakdown: count wrapper tags (inheritance)
-- File: mynclex/db/migrations/20260720120000_filter_breakdown_wrapper_tags.sql
-- =========================================================
-- Completes the wrapper-tag arc (20260717/20260718120000). The builder
-- has three tag-aware pieces: the picker (app-layer, done), the
-- eligibility pool (done — a wrapper tag counts as a tag on the
-- wrapper's questions), and the per-row honesty counts here. by_tag
-- still unnested only the QUESTION rows' own tags, so a wrapper-only
-- tag matched 7 questions but displayed 0 — a dishonest label.
--
-- Fix: by_tag now counts each question's EFFECTIVE tag set —
--   standalone question:  own tags ∪ its trend dataset's tags
--   case child:           own tags ∪ its case's tags
-- deduped per question (ARRAY(SELECT DISTINCT …)) so a tag carried by
-- both the question and its wrapper counts that question once.
--
-- Everything else in the function is unchanged from 5.1b
-- (20260506170000).

CREATE OR REPLACE FUNCTION nclex_filter_breakdown(p_filters JSONB)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student UUID := auth.uid();
  v_by_cnc      JSONB;
  v_by_subcat   JSONB;
  v_by_subject  JSONB;
  v_by_body     JSONB;
  v_by_qtype    JSONB;
  v_by_diff     JSONB;
  v_by_tag      JSONB;
  v_by_topic    JSONB;
  v_by_subtopic JSONB;
  v_by_pool     JSONB;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- by_cnc
  WITH expanded AS (
    SELECT bi.client_needs_category AS v
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'client_needs_category') p
    JOIN nclex_bank_items bi ON bi.item_id = p.unit_id
    WHERE p.unit_type = 'QUESTION' AND bi.client_needs_category IS NOT NULL
    UNION ALL
    SELECT bi.client_needs_category
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'client_needs_category') p
    JOIN nclex_case_study_items csi ON csi.case_id = p.unit_id
    JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
    WHERE p.unit_type = 'CASE' AND bi.client_needs_category IS NOT NULL
  )
  SELECT COALESCE(jsonb_object_agg(v, n), '{}'::jsonb) INTO v_by_cnc
  FROM (SELECT v, COUNT(*)::INT AS n FROM expanded GROUP BY v) g;

  -- by_subcat
  WITH expanded AS (
    SELECT bi.client_needs_subcategory AS v
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'client_needs_subcategory') p
    JOIN nclex_bank_items bi ON bi.item_id = p.unit_id
    WHERE p.unit_type = 'QUESTION' AND bi.client_needs_subcategory IS NOT NULL
    UNION ALL
    SELECT bi.client_needs_subcategory
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'client_needs_subcategory') p
    JOIN nclex_case_study_items csi ON csi.case_id = p.unit_id
    JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
    WHERE p.unit_type = 'CASE' AND bi.client_needs_subcategory IS NOT NULL
  )
  SELECT COALESCE(jsonb_object_agg(v, n), '{}'::jsonb) INTO v_by_subcat
  FROM (SELECT v, COUNT(*)::INT AS n FROM expanded GROUP BY v) g;

  -- by_subject
  WITH expanded AS (
    SELECT bi.nursing_subject AS v
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'nursing_subject') p
    JOIN nclex_bank_items bi ON bi.item_id = p.unit_id
    WHERE p.unit_type = 'QUESTION' AND bi.nursing_subject IS NOT NULL
    UNION ALL
    SELECT bi.nursing_subject
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'nursing_subject') p
    JOIN nclex_case_study_items csi ON csi.case_id = p.unit_id
    JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
    WHERE p.unit_type = 'CASE' AND bi.nursing_subject IS NOT NULL
  )
  SELECT COALESCE(jsonb_object_agg(v, n), '{}'::jsonb) INTO v_by_subject
  FROM (SELECT v, COUNT(*)::INT AS n FROM expanded GROUP BY v) g;

  -- by_body
  WITH expanded AS (
    SELECT bi.body_system AS v
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'body_system') p
    JOIN nclex_bank_items bi ON bi.item_id = p.unit_id
    WHERE p.unit_type = 'QUESTION' AND bi.body_system IS NOT NULL
    UNION ALL
    SELECT bi.body_system
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'body_system') p
    JOIN nclex_case_study_items csi ON csi.case_id = p.unit_id
    JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
    WHERE p.unit_type = 'CASE' AND bi.body_system IS NOT NULL
  )
  SELECT COALESCE(jsonb_object_agg(v, n), '{}'::jsonb) INTO v_by_body
  FROM (SELECT v, COUNT(*)::INT AS n FROM expanded GROUP BY v) g;

  -- by_qtype
  WITH expanded AS (
    SELECT bi.question_type AS v
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'question_type') p
    JOIN nclex_bank_items bi ON bi.item_id = p.unit_id
    WHERE p.unit_type = 'QUESTION'
    UNION ALL
    SELECT bi.question_type
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'question_type') p
    JOIN nclex_case_study_items csi ON csi.case_id = p.unit_id
    JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
    WHERE p.unit_type = 'CASE'
  )
  SELECT COALESCE(jsonb_object_agg(v, n), '{}'::jsonb) INTO v_by_qtype
  FROM (SELECT v, COUNT(*)::INT AS n FROM expanded GROUP BY v) g;

  -- by_diff
  WITH expanded AS (
    SELECT bi.difficulty AS v
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'difficulty') p
    JOIN nclex_bank_items bi ON bi.item_id = p.unit_id
    WHERE p.unit_type = 'QUESTION' AND bi.difficulty IS NOT NULL
    UNION ALL
    SELECT bi.difficulty
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'difficulty') p
    JOIN nclex_case_study_items csi ON csi.case_id = p.unit_id
    JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
    WHERE p.unit_type = 'CASE' AND bi.difficulty IS NOT NULL
  )
  SELECT COALESCE(jsonb_object_agg(v, n), '{}'::jsonb) INTO v_by_diff
  FROM (SELECT v, COUNT(*)::INT AS n FROM expanded GROUP BY v) g;

  -- by_tag — array column; unnest before grouping. Drop empty/null
  -- tags. A question with multiple tags contributes once to each.
  -- Wrapper-tag inheritance (20260717/20260718120000): each question's
  -- effective tag set is its own tags ∪ its wrapper's tags (trend
  -- dataset for standalone questions, case for case children), deduped
  -- per question so a shared tag counts the question once.
  WITH expanded AS (
    SELECT t AS v
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'tags') p
    JOIN nclex_bank_items bi ON bi.item_id = p.unit_id
    LEFT JOIN nclex_trend_datasets td ON td.trend_id = bi.trend_id,
         unnest(ARRAY(
           SELECT DISTINCT x FROM unnest(
             COALESCE(bi.tags, ARRAY[]::TEXT[]) || COALESCE(td.tags, ARRAY[]::TEXT[])
           ) x
         )) t
    WHERE p.unit_type = 'QUESTION' AND t IS NOT NULL AND t <> ''
    UNION ALL
    SELECT t
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'tags') p
    JOIN nclex_case_studies cs ON cs.case_id = p.unit_id
    JOIN nclex_case_study_items csi ON csi.case_id = p.unit_id
    JOIN nclex_bank_items bi ON bi.item_id = csi.item_id,
         unnest(ARRAY(
           SELECT DISTINCT x FROM unnest(
             COALESCE(bi.tags, ARRAY[]::TEXT[]) || COALESCE(cs.tags, ARRAY[]::TEXT[])
           ) x
         )) t
    WHERE p.unit_type = 'CASE' AND t IS NOT NULL AND t <> ''
  )
  SELECT COALESCE(jsonb_object_agg(v, n), '{}'::jsonb) INTO v_by_tag
  FROM (SELECT v, COUNT(*)::INT AS n FROM expanded GROUP BY v) g;

  -- by_topic
  WITH expanded AS (
    SELECT bi.topic AS v
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'topic') p
    JOIN nclex_bank_items bi ON bi.item_id = p.unit_id
    WHERE p.unit_type = 'QUESTION' AND bi.topic IS NOT NULL AND bi.topic <> ''
    UNION ALL
    SELECT bi.topic
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'topic') p
    JOIN nclex_case_study_items csi ON csi.case_id = p.unit_id
    JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
    WHERE p.unit_type = 'CASE' AND bi.topic IS NOT NULL AND bi.topic <> ''
  )
  SELECT COALESCE(jsonb_object_agg(v, n), '{}'::jsonb) INTO v_by_topic
  FROM (SELECT v, COUNT(*)::INT AS n FROM expanded GROUP BY v) g;

  -- by_subtopic
  WITH expanded AS (
    SELECT bi.subtopic AS v
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'subtopic') p
    JOIN nclex_bank_items bi ON bi.item_id = p.unit_id
    WHERE p.unit_type = 'QUESTION' AND bi.subtopic IS NOT NULL AND bi.subtopic <> ''
    UNION ALL
    SELECT bi.subtopic
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'subtopic') p
    JOIN nclex_case_study_items csi ON csi.case_id = p.unit_id
    JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
    WHERE p.unit_type = 'CASE' AND bi.subtopic IS NOT NULL AND bi.subtopic <> ''
  )
  SELECT COALESCE(jsonb_object_agg(v, n), '{}'::jsonb) INTO v_by_subtopic
  FROM (SELECT v, COUNT(*)::INT AS n FROM expanded GROUP BY v) g;

  -- by_pool — special. Drops both pool_history and pool_marked from
  -- the filter, computes the eligible pool, expands to questions, and
  -- derives each question's history-state on the fly. Returns:
  --   { UNSEEN, SEEN, CORRECT, INCORRECT, MARKED, ALL }
  -- where SEEN = CORRECT + INCORRECT (overlap with both, intentional
  -- per parent §10), MARKED = items the student bookmarked (from
  -- nclex_question_marks), and ALL = total expanded eligible count.
  WITH
  filters_no_pool AS (
    SELECT (p_filters - 'pool_history' - 'pool_marked') AS f
  ),
  last_ans AS (
    SELECT DISTINCT ON (ai.item_id)
      ai.item_id,
      aa.is_correct
    FROM nclex_attempt_answers aa
    JOIN nclex_attempt_items ai ON ai.attempt_item_id = aa.attempt_item_id
    WHERE aa.student_id = v_student
      AND ai.item_source = 'BANK'
      AND aa.submission_status IN ('SUBMITTED', 'AUTO_SUBMITTED')
    ORDER BY ai.item_id, aa.submitted_at DESC
  ),
  marks_q AS (
    SELECT target_id FROM nclex_question_marks
    WHERE student_id = v_student AND target_source = 'BANK' AND target_kind = 'QUESTION'
  ),
  marks_c AS (
    SELECT target_id FROM nclex_question_marks
    WHERE student_id = v_student AND target_source = 'BANK' AND target_kind = 'CASE'
  ),
  expanded AS (
    SELECT bi.item_id, NULL::TEXT AS parent_case_id
    FROM _nclex_eligible_unit_pool(v_student, (SELECT f FROM filters_no_pool)) p
    JOIN nclex_bank_items bi ON bi.item_id = p.unit_id
    WHERE p.unit_type = 'QUESTION'
    UNION ALL
    SELECT bi.item_id, p.unit_id
    FROM _nclex_eligible_unit_pool(v_student, (SELECT f FROM filters_no_pool)) p
    JOIN nclex_case_study_items csi ON csi.case_id = p.unit_id
    JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
    WHERE p.unit_type = 'CASE'
  ),
  per_q_state AS (
    SELECT
      e.item_id,
      e.parent_case_id,
      CASE
        WHEN la.item_id IS NULL    THEN 'UNSEEN'
        WHEN la.is_correct = TRUE  THEN 'CORRECT'
        WHEN la.is_correct = FALSE THEN 'INCORRECT'
        ELSE 'SEEN'
      END AS history_state,
      EXISTS (SELECT 1 FROM marks_q WHERE target_id = e.item_id) AS marked_q,
      e.parent_case_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM marks_c WHERE target_id = e.parent_case_id)
        AS marked_c
    FROM expanded e
    LEFT JOIN last_ans la ON la.item_id = e.item_id
  ),
  pool_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE history_state = 'UNSEEN')::INT    AS unseen,
      COUNT(*) FILTER (WHERE history_state = 'CORRECT')::INT   AS correct,
      COUNT(*) FILTER (WHERE history_state = 'INCORRECT')::INT AS incorrect,
      COUNT(*) FILTER (WHERE history_state IN ('CORRECT', 'INCORRECT'))::INT AS seen,
      COUNT(*) FILTER (WHERE marked_q OR marked_c)::INT AS marked,
      COUNT(*)::INT AS all_count
    FROM per_q_state
  )
  SELECT jsonb_build_object(
    'UNSEEN',    unseen,
    'SEEN',      seen,
    'CORRECT',   correct,
    'INCORRECT', incorrect,
    'MARKED',    marked,
    'ALL',       all_count
  ) INTO v_by_pool
  FROM pool_counts;

  RETURN jsonb_build_object(
    'by_cnc',      v_by_cnc,
    'by_subcat',   v_by_subcat,
    'by_subject',  v_by_subject,
    'by_body',     v_by_body,
    'by_qtype',    v_by_qtype,
    'by_diff',     v_by_diff,
    'by_tag',      v_by_tag,
    'by_topic',    v_by_topic,
    'by_subtopic', v_by_subtopic,
    'by_pool',     v_by_pool
  );
END;
$$;

-- Grants unchanged (REVOKE/GRANT set in 20260506170000 carry over on
-- CREATE OR REPLACE).
