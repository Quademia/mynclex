-- ─────────────────────────────────────────────────────────────────────
-- CAT Slice 10d (part 2) — the practice builder filters by the derived
-- band, not the curator's word
-- ─────────────────────────────────────────────────────────────────────
-- bank-consumption-cat.html §5.5.3.
--
-- Part 1 of this slice (20260826120000) made the runner's difficulty pill
-- derive from `difficulty_irt`, the number the engine selects on. That
-- closed the drift at the pill — and relocated it to the filter.
--
-- The practice builder's Difficulty axis is chosen and counted in the
-- database, on `bi.difficulty` — the curator's word. So the two ends of
-- one journey read two different facts about the same question: the
-- student picks by the word, and is then shown a band derived from the
-- number. Today they agree; the day recalibration moves a question they
-- stop agreeing, and the student ticks "Hard" and is handed a question
-- whose pill reads "Very hard".
--
-- That is more visible than the bug it replaced, not less. Before part 1
-- both ends read the stale word, so they agreed with each other while
-- both being wrong. A filter that disagrees with the label on the very
-- question it returned reads as a defect, not as calibration.
--
-- ── Where the rule lives ────────────────────────────────────────────
--
-- The cut-offs (±0.5, ±1.5) are a rule, and it lived in exactly one
-- place: bandForIrt() in lib/bank/difficulty.ts. Filtering by band inside
-- the database means the database needs that rule too — so this migration
-- has to put a second copy somewhere, and the risk is fixing a drift by
-- introducing one.
--
-- `nclex_difficulty_band()` below is that second copy, and it is bound to
-- the first by a test (lib/bank/difficulty-sql-parity.test.ts) that reads
-- the cut-offs straight out of THIS FILE and asserts they equal the
-- TypeScript ones. Edit one without the other and the suite goes red.
-- That is the same move Slice 10c made with estimateAbility: not a rule
-- forbidding divergence, a mechanism that makes it noisy.
--
-- Two alternatives were considered and rejected:
--   • a stored generated column — one definition, indexable, but the rule
--     still lives in SQL so the duplication is relocated rather than
--     removed, and it adds a column to the bank table and its tutor
--     mirror that part 1 deliberately avoided.
--   • sending numeric ranges from TypeScript, so the database never
--     learns what "Hard" means — genuinely the cleanest for the filter,
--     but the live per-band counts then need the five ranges passed in
--     and grouped by hand. Half the surface gets worse to make the other
--     half purer.
--
-- ── Six substitutions, one gateway ──────────────────────────────────
--
--   _nclex_eligible_unit_pool   2 — the standalone branch and the
--                                   case-child branch
--   nclex_filter_breakdown      4 — the same two branches, each needing
--                                   its select and its NOT NULL guard
--
-- `_nclex_eligible_unit_pool` is the single helper every practice path
-- funnels through, so nclex_count_eligible_items and nclex_create_attempt
-- follow for free and cannot drift from what the builder previewed —
-- the property Slice 10b3 leaned on for the CAT-pool exclusion.
--
-- ── Effect on dev today ─────────────────────────────────────────────
--
-- Near-nil, and that is expected. Of 807 questions in the practice pool,
-- 3 change band — all three GAIN one: they carry a number but no word, so
-- the difficulty filter could not reach them before and did not count
-- them. None loses a band. The 268 bank rows whose word already disagrees
-- with their number are almost all reserved CAT stock, which practice
-- excludes.
--
-- Like the rest of 10d, this is correct and quiet now, and load-bearing
-- the moment recalibration has real data to work with.
--
-- Bodies below were transformed from their live definitions under
-- assertions and dumped back verbatim, not retyped.
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.nclex_difficulty_band(p_irt numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
           WHEN p_irt IS NULL THEN NULL
           WHEN p_irt <= -1.5 THEN 'Very easy'
           WHEN p_irt <= -0.5 THEN 'Easy'
           WHEN p_irt <   0.5 THEN 'Medium'
           WHEN p_irt <   1.5 THEN 'Hard'
           ELSE                    'Very hard'
         END;
$function$
;
CREATE OR REPLACE FUNCTION public._nclex_eligible_unit_pool(p_student_id uuid, p_filters jsonb)
 RETURNS TABLE(unit_type text, unit_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

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
      AND bi.cat_pool           = FALSE
      AND bi.parent_case_id IS NULL
      AND (bi.trend_id IS NULL OR (td.trend_id IS NOT NULL AND td.is_published = TRUE))
      AND (jsonb_array_length(f.f_cnc)   = 0 OR bi.client_needs_category    IN (SELECT jsonb_array_elements_text(f.f_cnc)))
      AND (jsonb_array_length(f.f_cns)   = 0 OR bi.client_needs_subcategory IN (SELECT jsonb_array_elements_text(f.f_cns)))
      AND (jsonb_array_length(f.f_subj)  = 0 OR bi.nursing_subject          IN (SELECT jsonb_array_elements_text(f.f_subj)))
      AND (jsonb_array_length(f.f_bs)    = 0 OR bi.body_system              IN (SELECT jsonb_array_elements_text(f.f_bs)))
      AND (jsonb_array_length(f.f_qt)    = 0 OR bi.question_type            IN (SELECT jsonb_array_elements_text(f.f_qt)))
      AND (jsonb_array_length(f.f_diff)  = 0 OR nclex_difficulty_band(bi.difficulty_irt) IN (SELECT jsonb_array_elements_text(f.f_diff)))
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
      AND cs.cat_pool = FALSE
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
          AND (jsonb_array_length(f.f_diff)  = 0 OR nclex_difficulty_band(bi.difficulty_irt) IN (SELECT jsonb_array_elements_text(f.f_diff)))
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

$function$
;
CREATE OR REPLACE FUNCTION public.nclex_filter_breakdown(p_filters jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT nclex_difficulty_band(bi.difficulty_irt) AS v
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'difficulty') p
    JOIN nclex_bank_items bi ON bi.item_id = p.unit_id
    WHERE p.unit_type = 'QUESTION' AND bi.difficulty_irt IS NOT NULL
    UNION ALL
    SELECT nclex_difficulty_band(bi.difficulty_irt)
    FROM _nclex_eligible_unit_pool(v_student, p_filters - 'difficulty') p
    JOIN nclex_case_study_items csi ON csi.case_id = p.unit_id
    JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
    WHERE p.unit_type = 'CASE' AND bi.difficulty_irt IS NOT NULL
  )
  SELECT COALESCE(jsonb_object_agg(v, n), '{}'::jsonb) INTO v_by_diff
  FROM (SELECT v, COUNT(*)::INT AS n FROM expanded GROUP BY v) g;

  -- by_tag — array column; unnest before grouping. Drop empty/null
  -- tags. A question with multiple tags contributes once to each.
  -- Wrapper-tag inheritance (20260717/20260718120000): each question's
  -- effective tag set is its own tags plus its wrapper's tags (trend
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
  -- derives each question's history-state on the fly.
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
$function$
;