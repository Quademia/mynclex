-- =========================================================
-- MyNclex — Slice 2.2a: Count + create-attempt RPCs
-- File: mynclex/db/migrations/20260506150000_slice_2_2a_count_and_create_attempt.sql
-- =========================================================
-- The two builder-side RPCs that turn a filter set into a count (live,
-- many calls per filter change) or a fully-materialised attempt (once,
-- on Start Quiz click). Source-of-truth eligibility logic lives in a
-- single internal helper they both call — so the live count chip and
-- the actual quiz can never disagree.
--
-- v1 scope: bank source only. Tutor items are not selectable until
-- programme enrolment lands. Readiness Pack and Programme-assigned
-- sources are deferred (see planning doc §1, §9).
--
-- Source of truth:
--   docs/product-plan/bank-consumption-attempt-creation.html §2 §3 §4 §5 §10
--   docs/product-plan/bank-consumption.html §10 §17
--
-- Decisions locked for this slice (planning conversation 2026-05-06):
--   • Cases sit out when Question Type filter is active. The other
--     7 axes apply to the case at the case-classification level
--     (client_needs_category etc. on nclex_case_studies).
--   • Pool filter case rollups: Unseen=no child seen, Seen=any seen,
--     Correct=all 6 most-recent right, Incorrect=any most-recent wrong,
--     Marked=case-level mark OR any child-level mark.
--   • Pool filter combination: history chips OR each other; if Marked
--     is on, AND with the history result. Marked alone with no history
--     chips = "anything I marked." All 4 history chips off = no history
--     constraint (any state).
--   • Pool filter v1 implementation: inline subqueries against
--     nclex_attempt_answers + nclex_question_marks. Correct, slow on a
--     populated DB. Replaced with a join-against-MV in slice 7.3.
--   • Selection: target-with-drift ±3 (planning doc §4). Random shuffle,
--     walk linearly, take units while running_total + next.slot_cost
--     <= requested_count + 3, stop when running_total >= requested_count - 3.
--     If the pool can produce fewer than (requested_count - 3) questions
--     total, raise an error.
--   • All RPCs SECURITY DEFINER, search path locked to 'public'. The
--     internal helper does not check auth (called only from sibling
--     functions that already authenticated). Public RPCs validate
--     caller via auth.uid().


-- =========================================================
-- Helper: _nclex_eligible_unit_pool
-- =========================================================
-- Returns the eligible candidate pool for a (student, filters) pair as
-- (unit_type, unit_id) rows. Internal — leading underscore by convention.
-- Not exposed via RPC; called only from the count + create functions.
--
-- Returns:
--   unit_type ∈ 'QUESTION' | 'CASE'
--   unit_id   = bank item_id for QUESTION; case_id for CASE
--
-- Note: STABLE not VOLATILE — same input, same output within a single
-- statement, lets PG cache and parallelise.
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
  eligible_cases_base AS (
    SELECT cs.case_id,
           cs.client_needs_category, cs.client_needs_subcategory,
           cs.nursing_subject, cs.body_system, cs.difficulty,
           cs.topic, cs.subtopic, cs.tags
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

  -- Apply 7 of the 8 content filters at the case level (Question Type
  -- excluded — Rule 1: cases sit out when QType filter is active).
  -- The QType exclusion is enforced in the next CTE.
  cases_content_filtered AS (
    SELECT c.case_id
    FROM eligible_cases_base c, f
    WHERE
      (jsonb_array_length(f.f_qt) = 0)  -- cases sit out entirely if QType filter is active
      AND (jsonb_array_length(f.f_cnc)   = 0 OR c.client_needs_category    IN (SELECT jsonb_array_elements_text(f.f_cnc)))
      AND (jsonb_array_length(f.f_cns)   = 0 OR c.client_needs_subcategory IN (SELECT jsonb_array_elements_text(f.f_cns)))
      AND (jsonb_array_length(f.f_subj)  = 0 OR c.nursing_subject          IN (SELECT jsonb_array_elements_text(f.f_subj)))
      AND (jsonb_array_length(f.f_bs)    = 0 OR c.body_system              IN (SELECT jsonb_array_elements_text(f.f_bs)))
      AND (jsonb_array_length(f.f_diff)  = 0 OR c.difficulty               IN (SELECT jsonb_array_elements_text(f.f_diff)))
      AND (jsonb_array_length(f.f_topic) = 0 OR c.topic                    IN (SELECT jsonb_array_elements_text(f.f_topic)))
      AND (jsonb_array_length(f.f_subtopic) = 0 OR c.subtopic              IN (SELECT jsonb_array_elements_text(f.f_subtopic)))
      AND (jsonb_array_length(f.f_tags)  = 0 OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(f.f_tags) tag
            WHERE tag = ANY(c.tags)
          ))
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


-- =========================================================
-- nclex_count_eligible_items
-- =========================================================
-- Live builder count: total + breakdown by question type.
-- Cases are expanded into their 6 children for the breakdown so the
-- "Roughly: 14 MCQ · 6 SATA · ..." line reflects what the student
-- will actually see.
CREATE OR REPLACE FUNCTION nclex_count_eligible_items(p_filters JSONB)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student UUID := auth.uid();
  v_total   INTEGER;
  v_by_qt   JSONB;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- Expand each unit to its constituent questions, then group by type.
  WITH expanded AS (
    SELECT bi.question_type
    FROM _nclex_eligible_unit_pool(v_student, p_filters) p
    JOIN nclex_bank_items bi ON bi.item_id = p.unit_id
    WHERE p.unit_type = 'QUESTION'
    UNION ALL
    SELECT bi.question_type
    FROM _nclex_eligible_unit_pool(v_student, p_filters) p
    JOIN nclex_case_study_items csi ON csi.case_id = p.unit_id
    JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
    WHERE p.unit_type = 'CASE'
  )
  SELECT
    COALESCE(SUM(n), 0)::INTEGER,
    COALESCE(jsonb_object_agg(question_type, n), '{}'::jsonb)
  INTO v_total, v_by_qt
  FROM (
    SELECT question_type, COUNT(*)::INTEGER AS n
    FROM expanded
    GROUP BY question_type
  ) g;

  RETURN jsonb_build_object('total', v_total, 'by_question_type', v_by_qt);
END;
$$;


-- =========================================================
-- nclex_create_attempt
-- =========================================================
-- Builder Start click. Validates, picks units, snapshots into the four
-- attempt tables, returns the new attempt_id. Single transaction.
--
-- Selection algorithm (per planning §4 — target-with-drift ±3):
--   1. Compute the eligible pool.
--   2. Random shuffle; walk linearly.
--   3. Take a unit if running_total + slot_cost <= requested_count + 3.
--   4. Stop when running_total >= requested_count - 3.
--   5. If the pool's max possible question count is below
--      requested_count - 3, error out.
CREATE OR REPLACE FUNCTION nclex_create_attempt(
  p_filters         JSONB,
  p_mode            TEXT,
  p_intent          TEXT,
  p_requested_count INTEGER,
  p_source          TEXT DEFAULT 'CUSTOM_BUILT'
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
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
  -- 1. Auth + basic input validation
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_source <> 'CUSTOM_BUILT' THEN
    RAISE EXCEPTION 'only CUSTOM_BUILT source supported in v1 (got %)', p_source;
  END IF;

  IF p_requested_count IS NULL OR p_requested_count < 5 OR p_requested_count > 150 THEN
    RAISE EXCEPTION 'requested_count out of range (5..150): %', p_requested_count;
  END IF;

  -- The CHECK constraints on nclex_attempts will reject invalid
  -- (intent, mode) tuples; we let those fire for defence in depth
  -- rather than re-listing the matrix here.

  -- 2. Sanity-check the pool can produce >= requested_count - 3 questions
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

  -- 3. Insert the attempt row. CAT mode skipped per planning §1; this
  --    function only handles fixed-length modes.
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

  -- 4. Pick + expand + snapshot, in a single shuffled-pool walk.
  --    Slot cost: 1 for QUESTION, 6 for CASE (atomic).
  FOR r_unit IN
    WITH pool AS (
      SELECT unit_type, unit_id,
             CASE unit_type WHEN 'CASE' THEN 6 ELSE 1 END AS slot_cost,
             random() AS rnd
      FROM _nclex_eligible_unit_pool(v_student, p_filters)
    )
    SELECT unit_type, unit_id, slot_cost FROM pool ORDER BY rnd
  LOOP
    -- Already at or past target — done. Drift only applies in the
    -- direction of *over*shooting (cases that don't fit cleanly).
    IF v_running >= p_requested_count THEN
      EXIT;
    END IF;
    -- Upper-drift guard: skip units that would land us above target+3.
    IF v_running + r_unit.slot_cost > p_requested_count + 3 THEN
      CONTINUE;
    END IF;

    IF r_unit.unit_type = 'QUESTION' THEN
      -- Snapshot trend dataset if applicable (one row per attempt × trend)
      INSERT INTO nclex_attempt_trend_snapshots (
        attempt_id, trend_id, title_snapshot, scenario_snapshot,
        kind_snapshot, row_label_snapshot, timepoints_snapshot_json, rows_snapshot_json
      )
      SELECT v_attempt_id, td.trend_id, td.title, td.scenario,
             td.kind, td.row_label,
             COALESCE(td.timepoints, '[]'::jsonb),
             COALESCE(td.rows, '[]'::jsonb)
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
        '{}'::jsonb  -- option order: deferred to runner shuffle (slice 4.x)
      FROM nclex_bank_items bi WHERE bi.item_id = r_unit.unit_id;

      v_running := v_running + 1;

    ELSIF r_unit.unit_type = 'CASE' THEN
      -- Snapshot the case scenario once
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

      -- Snapshot 6 children in case_position order
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

  -- Lower-drift guard. Defensive — the pool sanity check at step 2
  -- should already prevent this, but a pool that contains only large
  -- units (e.g. all cases) could theoretically end with v_running
  -- below target - 3 once non-fitting units are skipped.
  IF v_running < p_requested_count - 3 THEN
    RAISE EXCEPTION 'pool too small to satisfy requested count: produced %, needed at least %',
      v_running, p_requested_count - 3;
  END IF;

  -- 5. Update attempt counters
  UPDATE nclex_attempts
  SET actual_question_count = v_running,
      actual_unit_count     = v_actual_units,
      updated_at            = NOW()
  WHERE attempt_id = v_attempt_id;

  RETURN v_attempt_id;
END;
$$;


-- =========================================================
-- Grants — restrict to authenticated role only.
-- =========================================================
-- Supabase grants EXECUTE to anon AND authenticated by default on every
-- function in the public schema, on top of the implicit PUBLIC grant.
-- REVOKE FROM PUBLIC alone leaves anon/authenticated wide open. Revoke
-- from all three explicitly, then grant back only the role we want.
REVOKE EXECUTE ON FUNCTION _nclex_eligible_unit_pool(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION nclex_count_eligible_items(JSONB)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION nclex_create_attempt(JSONB, TEXT, TEXT, INTEGER, TEXT)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION nclex_count_eligible_items(JSONB)              TO authenticated;
GRANT EXECUTE ON FUNCTION nclex_create_attempt(JSONB, TEXT, TEXT, INTEGER, TEXT) TO authenticated;
-- _nclex_eligible_unit_pool is intentionally NOT granted. It's an
-- internal helper accepting an arbitrary student_id parameter — direct
-- access would let anyone enumerate any student's pool. The public RPCs
-- above call it via SECURITY DEFINER context (postgres role privileges)
-- so the revoke doesn't block them.
