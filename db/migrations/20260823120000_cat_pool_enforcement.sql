-- ─────────────────────────────────────────────────────────────────────
-- CAT Slice 10b3 — the reservation starts being honoured
-- ─────────────────────────────────────────────────────────────────────
-- Until now `cat_pool` was written by the editor, read by the admin page,
-- and obeyed by nothing: CAT still drew from the whole published bank and
-- reserved questions still appeared in student practice. This closes both
-- directions (bank-consumption-cat.html §20.2 / §20.6).
--
--   1. PRACTICE stops serving reserved stock.
--   2. CAT serves ONLY reserved stock.
--   3. Reserving also clears the practice-side visibility flags, so the
--      exclusion is enforced at two layers rather than one.
--
-- ── Why CAT stops requiring `is_builder_visible` ────────────────────
--
-- Both CAT picks currently demand `is_builder_visible IS TRUE`. That was
-- harmless while CAT drew from the practice bank; with reservation
-- enforced it becomes a contradiction that would empty the pool.
-- `is_builder_visible` means "offer this in the student practice
-- builder" — precisely what a reserved question must NOT be. So the
-- moment a curator did the sensible thing and hid reserved stock from
-- the builder, CAT would find nothing to serve.
--
-- Reservation is now what makes an item CAT-eligible. Builder visibility
-- is a practice-side flag and CAT stops reading it.
--
-- ── Two layers, deliberately ────────────────────────────────────────
--
-- The primary gate is `cat_pool` in `_nclex_eligible_unit_pool`: one
-- predicate in the one helper every practice path funnels through
-- (nclex_create_attempt, nclex_count_eligible_items and
-- nclex_filter_breakdown all call it, so they follow for free and cannot
-- drift). That alone is sufficient.
--
-- The second layer is clearing `is_builder_visible` on reservation, so a
-- reserved row is unservable to practice even if some future query
-- forgets the pool predicate. Backfilled below for the stock reserved so
-- far. The admin page's "still visible in the student builder" audit
-- card is what catches any that drift back.
--
-- `is_free_sample` is cleared alongside it: a free sample is public shop
-- window and a reserved question must not be seen before the exam — the
-- two cannot both be true. Eight rows on dev were both. (Sam, 2026-07-29:
-- unmark those; free samples are not in use at the moment. Only reserved
-- rows are touched — the flag is left alone elsewhere.)

-- ── 1. practice stops serving reserved stock ────────────────────────
-- Two predicates: one for individually-reserved questions (standalone
-- and trend-linked alike, since `std_q` carries both), one for reserved
-- case wrappers. Case CHILDREN need no predicate — `parent_case_id IS
-- NULL` already keeps them out of this pool entirely.

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
      AND bi.cat_pool           = FALSE   -- §20 10b3: reserved stock is not practice stock
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
      AND cs.cat_pool = FALSE             -- §20 10b3: a reserved case is not practice stock
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

$function$;

-- ── 2. the second enforcement layer + the free-sample contradiction ──
-- Reserved stock loses its practice-side flags. The pool predicate above
-- is what actually enforces the exclusion; this makes a reserved row
-- unservable even to a query that forgets it.

UPDATE nclex_bank_items
   SET is_builder_visible = FALSE
 WHERE cat_pool IS TRUE AND is_builder_visible IS TRUE;

UPDATE nclex_bank_items
   SET is_free_sample = FALSE
 WHERE cat_pool IS TRUE AND is_free_sample IS TRUE;

UPDATE nclex_case_studies
   SET is_builder_visible = FALSE
 WHERE cat_pool IS TRUE AND is_builder_visible IS TRUE;

-- ── 3. CAT draws ONLY from the pool — the first item ─────────────────
-- Two picks here, strict then exposure-relaxed; both gain the pool
-- predicate and both drop `is_builder_visible` (see the header).

CREATE OR REPLACE FUNCTION public.create_cat_attempt(p_student_id uuid, p_intent text, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
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
  WHERE bi.is_published IS TRUE AND bi.cat_pool IS TRUE
    AND bi.difficulty_irt IS NOT NULL AND bi.trend_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM nclex_case_study_items csi WHERE csi.item_id = bi.item_id)
    AND NOT EXISTS (SELECT 1 FROM seen WHERE seen.item_id = bi.item_id)
  ORDER BY abs(bi.difficulty_irt - C_START_THETA), random() LIMIT 1;

  IF NOT FOUND THEN
    v_relaxed := TRUE;
    SELECT bi.* INTO v_item
    FROM nclex_bank_items bi
    WHERE bi.is_published IS TRUE AND bi.cat_pool IS TRUE
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

-- ── 4. CAT draws ONLY from the pool — every item after the first ─────
-- Three selection branches, and they are NOT all the same:
--
--   • mid-case (continuing a case already begun) — no pool predicate.
--     The case was vetted when it was scheduled; re-checking here would
--     abandon a student mid-block if a curator released it during the
--     sitting, which is worse than finishing the case they started.
--   • the scheduled case slot — gains `cs.cat_pool IS TRUE`.
--   • the adaptive standalone pick (strict + relaxed) — gains
--     `bi.cat_pool IS TRUE`, drops `is_builder_visible`.
--
-- The case-slot branch also gains `cs.is_published` unchanged and still
-- does not read `is_builder_visible` — which is now consistent with the
-- standalone picks rather than differing from them, closing a drift that
-- predates this slice.

CREATE OR REPLACE FUNCTION public.cat_next_item(p_attempt_id uuid, p_last_answer_payload jsonb, p_score_awarded numeric, p_is_correct boolean, p_theta_after numeric, p_se_after numeric, p_terminate_reason text DEFAULT NULL::text, p_terminate_verdict text DEFAULT NULL::text, p_expected_item_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  IF v_current.parent_case_id IS NOT NULL AND v_current.case_position < 6 THEN
    v_case_id := v_current.parent_case_id;
    v_child_pos := v_current.case_position + 1;
    SELECT bi.*, csi.cjmm_step AS csi_step INTO v_item
    FROM nclex_case_study_items csi JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
    WHERE csi.case_id = v_case_id AND csi.position = v_child_pos;
    IF NOT FOUND THEN RAISE EXCEPTION 'case % has no child at position %', v_case_id, v_child_pos; END IF;
    v_weight := 0.5; v_unit_type := 'CASE'; v_unit_id := v_case_id;
    v_parent_case := v_case_id; v_cjmm := v_item.csi_step;

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
      AND cs.cat_pool IS TRUE
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
  END IF;

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
      WHERE bi.is_published IS TRUE AND bi.cat_pool IS TRUE
        AND bi.difficulty_irt IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM nclex_case_study_items csi WHERE csi.item_id = bi.item_id)
        AND (bi.trend_id IS NULL OR NOT EXISTS (SELECT 1 FROM used_trends ut WHERE ut.trend_id = bi.trend_id))
        AND NOT EXISTS (SELECT 1 FROM nclex_attempt_items ai
                        WHERE ai.attempt_id = p_attempt_id AND ai.item_id = bi.item_id)
        AND NOT EXISTS (SELECT 1 FROM seen WHERE seen.item_id = bi.item_id)
    )
    SELECT * INTO v_item FROM eligible WHERE dist = (SELECT MIN(dist) FROM eligible)
    ORDER BY (client_needs_category IS DISTINCT FROM v_under), random() LIMIT 1;

    IF NOT FOUND THEN
      v_relaxed := TRUE;
      WITH used_trends AS (
        SELECT DISTINCT ai.trend_id FROM nclex_attempt_items ai
        WHERE ai.attempt_id = p_attempt_id AND ai.trend_id IS NOT NULL
      ), eligible AS (
        SELECT bi.*, abs(bi.difficulty_irt - p_theta_after) AS dist
        FROM nclex_bank_items bi
        WHERE bi.is_published IS TRUE AND bi.cat_pool IS TRUE
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
