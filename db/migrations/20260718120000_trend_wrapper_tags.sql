-- =========================================================
-- MyNclex — Trend wrapper tags (case-wrapper symmetry)
-- File: mynclex/db/migrations/20260718120000_trend_wrapper_tags.sql
-- =========================================================
-- The case wrapper keeps `tags` (the one classification survivor —
-- see 20260717120000); the trend wrapper gains the same field so the
-- two wrappers stay twins. Settled with Sam 2026-07-03.
--
-- Same inheritance rule as cases: a tag on a trend counts as a tag on
-- every question linked to it in the student builder. Trend-linked
-- questions are standalone units in the pool (std_q branch — they are
-- not case children), so the inheritance lands there: a question's
-- effective tag set = its own tags ∪ its dataset's tags. Non-trend
-- questions are unaffected (their dataset join is NULL → empty array).
--
-- Additive: two new columns + one function replacement. No app reads
-- break; the trend wrapper editor starts writing tags in the same
-- release.

-- ── 1. Columns (mirror nclex_case_studies.tags) ─────────────
ALTER TABLE nclex_trend_datasets
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE nclex_tutor_trend_datasets
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- ── 2. Pool function — trend-tag inheritance in std_q ───────
-- Identical to 20260717120000 except the std_q tag predicate, which
-- now merges the (already-joined) trend dataset's tags into the
-- question's own before matching.
CREATE OR REPLACE FUNCTION _nclex_eligible_unit_pool(
  p_student_id UUID,
  p_filters    JSONB
)
RETURNS TABLE(unit_type TEXT, unit_id TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$

  WITH
  f AS (
    SELECT
      COALESCE(p_filters->'client_needs_category',     '[]'::jsonb) AS f_cnc,
      COALESCE(p_filters->'client_needs_subcategory',  '[]'::jsonb) AS f_cns,
      COALESCE(p_filters->'nursing_subject',           '[]'::jsonb) AS f_subj,
      COALESCE(p_filters->'body_system',               '[]'::jsonb) AS f_bs,
      COALESCE(p_filters->'question_type',             '[]'::jsonb) AS f_qt,
      COALESCE(p_filters->'difficulty',                '[]'::jsonb) AS f_diff,
      COALESCE(p_filters->'tags',                      '[]'::jsonb) AS f_tags,
      COALESCE(p_filters->'topic',                     '[]'::jsonb) AS f_topic,
      COALESCE(p_filters->'subtopic',                  '[]'::jsonb) AS f_subtopic,
      COALESCE(p_filters->'pool_history',              '[]'::jsonb) AS f_history,
      COALESCE((p_filters->>'pool_marked')::BOOLEAN,   FALSE)       AS f_marked
  ),

  last_ans AS (
    SELECT DISTINCT ON (ai.item_id)
      ai.item_id,
      aa.is_correct
    FROM nclex_attempt_answers aa
    JOIN nclex_attempt_items   ai ON ai.attempt_item_id = aa.attempt_item_id
    WHERE aa.student_id = p_student_id
      AND ai.item_source = 'BANK'
      AND aa.submission_status IN ('SUBMITTED','AUTO_SUBMITTED')
    ORDER BY ai.item_id, aa.submitted_at DESC
  ),

  marks_q AS (
    SELECT target_id FROM nclex_question_marks
    WHERE student_id = p_student_id AND target_source = 'BANK' AND target_kind = 'QUESTION'
  ),
  marks_c AS (
    SELECT target_id FROM nclex_question_marks
    WHERE student_id = p_student_id AND target_source = 'BANK' AND target_kind = 'CASE'
  ),

  -- Standalone bank items (incl. trend-linked questions). A question's
  -- effective tag set is its own tags ∪ its trend dataset's tags
  -- (wrapper-tag inheritance — the case twin of this rule lives in
  -- cases_content_filtered below).
  std_q AS (
    SELECT
      bi.item_id,
      bi.question_type,
      CASE
        WHEN la.item_id IS NULL          THEN 'UNSEEN'
        WHEN la.is_correct = TRUE        THEN 'CORRECT'
        WHEN la.is_correct = FALSE       THEN 'INCORRECT'
        ELSE 'SEEN'
      END AS history_state,
      EXISTS (SELECT 1 FROM marks_q WHERE marks_q.target_id = bi.item_id) AS is_marked_q
    FROM nclex_bank_items bi
    LEFT JOIN last_ans la ON la.item_id = bi.item_id
    LEFT JOIN nclex_trend_datasets td ON td.trend_id = bi.trend_id
    , f
    WHERE bi.is_published       = TRUE
      AND bi.is_builder_visible = TRUE
      AND bi.parent_case_id IS NULL
      AND (bi.trend_id IS NULL OR (td.trend_id IS NOT NULL AND td.is_published = TRUE))
      AND (jsonb_array_length(f.f_cnc)   = 0 OR bi.client_needs_category    IN (SELECT jsonb_array_elements_text(f.f_cnc)))
      AND (jsonb_array_length(f.f_cns)   = 0 OR bi.client_needs_subcategory IN (SELECT jsonb_array_elements_text(f.f_cns)))
      AND (jsonb_array_length(f.f_subj)  = 0 OR bi.nursing_subject          IN (SELECT jsonb_array_elements_text(f.f_subj)))
      AND (jsonb_array_length(f.f_bs)    = 0 OR bi.body_system              IN (SELECT jsonb_array_elements_text(f.f_bs)))
      AND (jsonb_array_length(f.f_qt)    = 0 OR bi.question_type            IN (SELECT jsonb_array_elements_text(f.f_qt)))
      AND (jsonb_array_length(f.f_diff)  = 0 OR bi.difficulty               IN (SELECT jsonb_array_elements_text(f.f_diff)))
      AND (jsonb_array_length(f.f_topic) = 0 OR bi.topic                    IN (SELECT jsonb_array_elements_text(f.f_topic)))
      AND (jsonb_array_length(f.f_subtopic) = 0 OR bi.subtopic              IN (SELECT jsonb_array_elements_text(f.f_subtopic)))
      AND (jsonb_array_length(f.f_tags)  = 0 OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(f.f_tags) tag
            WHERE tag = ANY(COALESCE(bi.tags, '{}'::TEXT[]) || COALESCE(td.tags, '{}'::TEXT[]))
          ))
  ),

  std_q_pool_filtered AS (
    SELECT q.item_id, q.question_type
    FROM std_q q, f
    WHERE
      (jsonb_array_length(f.f_history) = 0
        OR q.history_state IN (SELECT jsonb_array_elements_text(f.f_history)))
      AND (NOT f.f_marked OR q.is_marked_q)
  ),

  eligible_cases_base AS (
    SELECT cs.case_id, cs.tags
    FROM nclex_case_studies cs
    WHERE cs.is_published = TRUE
      AND cs.is_builder_visible = TRUE
      AND (
        SELECT COUNT(DISTINCT csi.position)
        FROM nclex_case_study_items csi
        JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
        WHERE csi.case_id = cs.case_id
          AND csi.position BETWEEN 1 AND 6
          AND bi.is_published = TRUE
      ) = 6
  ),

  cases_content_filtered AS (
    SELECT c.case_id
    FROM eligible_cases_base c, f
    WHERE
      (jsonb_array_length(f.f_qt) = 0)
      AND EXISTS (
        SELECT 1
        FROM nclex_case_study_items csi
        JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
        WHERE csi.case_id = c.case_id
          AND (jsonb_array_length(f.f_cnc)   = 0 OR bi.client_needs_category    IN (SELECT jsonb_array_elements_text(f.f_cnc)))
          AND (jsonb_array_length(f.f_cns)   = 0 OR bi.client_needs_subcategory IN (SELECT jsonb_array_elements_text(f.f_cns)))
          AND (jsonb_array_length(f.f_subj)  = 0 OR bi.nursing_subject          IN (SELECT jsonb_array_elements_text(f.f_subj)))
          AND (jsonb_array_length(f.f_bs)    = 0 OR bi.body_system              IN (SELECT jsonb_array_elements_text(f.f_bs)))
          AND (jsonb_array_length(f.f_diff)  = 0 OR bi.difficulty               IN (SELECT jsonb_array_elements_text(f.f_diff)))
          AND (jsonb_array_length(f.f_topic) = 0 OR bi.topic                    IN (SELECT jsonb_array_elements_text(f.f_topic)))
          AND (jsonb_array_length(f.f_subtopic) = 0 OR bi.subtopic              IN (SELECT jsonb_array_elements_text(f.f_subtopic)))
          AND (jsonb_array_length(f.f_tags)  = 0 OR EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(f.f_tags) tag
                WHERE tag = ANY(COALESCE(bi.tags, '{}'::TEXT[]) || COALESCE(c.tags, '{}'::TEXT[]))
              ))
      )
  ),

  case_rollup AS (
    SELECT
      c.case_id,
      COUNT(*)                                                       AS n_children,
      COUNT(la.item_id)                                              AS n_seen,
      COUNT(*) FILTER (WHERE la.is_correct = TRUE)                   AS n_correct,
      COUNT(*) FILTER (WHERE la.is_correct = FALSE)                  AS n_incorrect,
      BOOL_OR(EXISTS (SELECT 1 FROM marks_q WHERE marks_q.target_id = csi.item_id)) AS any_child_marked
    FROM cases_content_filtered c
    JOIN nclex_case_study_items csi ON csi.case_id = c.case_id
    LEFT JOIN last_ans la ON la.item_id = csi.item_id
    GROUP BY c.case_id
  ),

  cases_pool_filtered AS (
    SELECT
      cr.case_id,
      CASE
        WHEN cr.n_seen = 0                              THEN 'UNSEEN'
        WHEN cr.n_incorrect > 0                          THEN 'INCORRECT'
        WHEN cr.n_correct = cr.n_children                THEN 'CORRECT'
        ELSE 'SEEN'
      END AS case_history_state,
      (EXISTS (SELECT 1 FROM marks_c WHERE marks_c.target_id = cr.case_id)
        OR cr.any_child_marked) AS case_marked
    FROM case_rollup cr
  ),

  cases_final AS (
    SELECT cpf.case_id
    FROM cases_pool_filtered cpf, f
    WHERE
      (jsonb_array_length(f.f_history) = 0
        OR cpf.case_history_state IN (SELECT jsonb_array_elements_text(f.f_history)))
      AND (NOT f.f_marked OR cpf.case_marked)
  )

  SELECT 'QUESTION'::text AS unit_type, item_id AS unit_id FROM std_q_pool_filtered
  UNION ALL
  SELECT 'CASE'::text, case_id FROM cases_final;

$$;
