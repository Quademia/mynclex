-- =========================================================
-- MyNclex — Builder case eligibility: derive from children
-- File: mynclex/db/migrations/20260717120000_builder_case_eligibility_children.sql
-- =========================================================
-- Fixes the practice-builder bug where editor-authored case studies were
-- invisible to every classification/tag filter (found 2026-07-03 by Sam's
-- Slice-7 test).
--
-- Root cause: the wrapper-v2 design relegated classification to the CHILD
-- questions (the case-level columns are legacy, never written by the case
-- editor — createCaseAction inserts only case_id + title, and the case Save
-- never touches classification), but _nclex_eligible_unit_pool (slice 2.2a,
-- which predates that decision) still matched cases against the case row's
-- own category/subject/topic/tags/difficulty. Old SQL-seeded cases carry
-- hand-written values so the bug hid; every editor-authored case has NULLs
-- and vanished the moment any content filter was active.
--
-- The fix (settled with Sam 2026-07-03):
--   • A case matches when AT LEAST ONE of its child questions matches ALL
--     active content axes simultaneously ("one child ticks all boxes") —
--     the same conjunction standalone questions pass, wrapped in EXISTS.
--     NOT per-axis-independent matching: a case with an easy Physio child
--     and a hard Psych child must NOT pass a "hard Physio" filter.
--   • Tags are the one axis where the WRAPPER keeps a voice: a tag on the
--     case counts as a tag on every child (inheritance). A child's
--     effective tag set = its own tags ∪ the case's tags.
--   • The QType sit-out rule is unchanged: cases sit out entirely when a
--     Question-Type filter is active (locked slice 2.2a).
--   • Pool-history / marked rollups unchanged.
--
-- Downstream: nclex_count_eligible_items, nclex_create_attempt and
-- nclex_filter_breakdown all call this helper and need no change — the
-- breakdown RPC already groups by the CHILD questions' own columns.
--
-- This replacement also stops reading the seven legacy case-level
-- classification columns (client_needs_category/subcategory,
-- nursing_subject, body_system, difficulty, topic, subtopic), clearing the
-- way for a follow-up migration to drop them. `tags` stays (wrapper tags
-- are a real feature as of this arc).

CREATE OR REPLACE FUNCTION _nclex_eligible_unit_pool(
  p_student_id UUID,
  p_filters    JSONB
)
RETURNS TABLE(unit_type TEXT, unit_id TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$

  WITH
  -- Unpack filters into local CTEs of value lists. Empty array / missing
  -- key means "no filter on this axis" — the WHERE clauses below check
  -- jsonb_array_length and skip when zero.
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

  -- Most-recent submitted answer per (item_id, item_source). Bank only
  -- in v1 — item_source filter applied at the snapshot side.
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

  -- Marks for this student, split by target kind.
  marks_q AS (
    SELECT target_id FROM nclex_question_marks
    WHERE student_id = p_student_id AND target_source = 'BANK' AND target_kind = 'QUESTION'
  ),
  marks_c AS (
    SELECT target_id FROM nclex_question_marks
    WHERE student_id = p_student_id AND target_source = 'BANK' AND target_kind = 'CASE'
  ),

  -- Standalone bank items. parent_case_id IS NULL covers both true
  -- standalone Qs and trend-linked Qs (since trend Qs are not children
  -- of cases). Trend-linked Qs additionally require the trend to be
  -- published.
  std_q AS (
    SELECT
      bi.item_id,
      bi.question_type,
      -- per-item history state
      CASE
        WHEN la.item_id IS NULL          THEN 'UNSEEN'
        WHEN la.is_correct = TRUE        THEN 'CORRECT'
        WHEN la.is_correct = FALSE       THEN 'INCORRECT'
        ELSE 'SEEN'
      END AS history_state,
      -- is the item marked at the question level?
      EXISTS (SELECT 1 FROM marks_q WHERE marks_q.target_id = bi.item_id) AS is_marked_q
    FROM nclex_bank_items bi
    LEFT JOIN last_ans la ON la.item_id = bi.item_id
    LEFT JOIN nclex_trend_datasets td ON td.trend_id = bi.trend_id
    , f
    WHERE bi.is_published       = TRUE
      AND bi.is_builder_visible = TRUE
      AND bi.parent_case_id IS NULL
      -- trend-linked Qs need the dataset published; non-trend Qs always pass
      AND (bi.trend_id IS NULL OR (td.trend_id IS NOT NULL AND td.is_published = TRUE))
      -- 8-axis content filter (OR-within-axis, AND-across)
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
            WHERE tag = ANY(bi.tags)
          ))
  ),

  -- Apply pool filter to standalone Qs.
  -- History chips OR each other; Marked ANDs against the result if on.
  std_q_pool_filtered AS (
    SELECT q.item_id, q.question_type
    FROM std_q q, f
    WHERE
      (jsonb_array_length(f.f_history) = 0
        OR q.history_state IN (SELECT jsonb_array_elements_text(f.f_history)))
      AND (NOT f.f_marked OR q.is_marked_q)
  ),

  -- Eligible cases: published, builder-visible, all 6 children present
  -- and themselves published bank items. Per planning §3.3.
  -- Only case_id + tags are read off the case row — classification is
  -- derived from the children below (wrapper-v2: no classification on
  -- the wrapper; tags kept for wrapper-tag inheritance).
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

  -- Content filter, derived from the CHILDREN (7 of the 8 axes; Question
  -- Type excluded — Rule 1: cases sit out when QType filter is active).
  -- A case matches when at least ONE child question matches ALL active
  -- axes simultaneously — the same conjunction a standalone question
  -- passes. A child's effective tag set is its own tags plus the case's
  -- tags (wrapper-tag inheritance).
  cases_content_filtered AS (
    SELECT c.case_id
    FROM eligible_cases_base c, f
    WHERE
      (jsonb_array_length(f.f_qt) = 0)  -- cases sit out entirely if QType filter is active
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

  -- Per-case pool rollup. For each candidate case compute:
  --   - any_seen, all_correct (across 6 children's most-recent answers)
  --   - any_marked_at_child_level
  case_rollup AS (
    SELECT
      c.case_id,
      -- counts across children
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
      -- case-level history rollup (per planning + locked rules)
      CASE
        WHEN cr.n_seen = 0                              THEN 'UNSEEN'
        WHEN cr.n_incorrect > 0                          THEN 'INCORRECT'
        WHEN cr.n_correct = cr.n_children                THEN 'CORRECT'
        ELSE 'SEEN'  -- partial completion, no incorrect
      END AS case_history_state,
      -- case-level marking: case-target mark OR any child-target mark
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
