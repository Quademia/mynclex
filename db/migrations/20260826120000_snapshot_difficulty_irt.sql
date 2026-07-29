-- ─────────────────────────────────────────────────────────────────────
-- CAT Slice 10d — the attempt snapshot carries the number, not the word
-- ─────────────────────────────────────────────────────────────────────
-- bank-consumption-cat.html §5.5.2b.
--
-- A question's difficulty exists twice: the curator's word
-- (`nclex_bank_items.difficulty`) and the measured number
-- (`difficulty_irt`, on the Rasch logit scale). The CAT engine reads the
-- number. Humans are shown a word. Recalibration (Slice 10c) moves the
-- number and by rule (§5.2) never rewrites the curator's word — so the
-- word goes stale on purpose, and a question authored "Medium" that
-- students find hard keeps reading "Medium" while the engine treats it
-- as Hard.
--
-- §5.5 exists to close that drift: derive the shown band from the
-- number. `displayBand()` shipped in Slice 10a to do exactly that, and
-- has never once fired — because every attempt freezes a snapshot of
-- each question's classification, and that snapshot carries the WORD.
-- The number never reaches the pill, so the derivation always falls back
-- to the frozen label.
--
-- This migration changes what is frozen. `classification_snapshot` now
-- carries `difficulty_irt` IN PLACE OF `difficulty`.
--
-- ── Why in place of, and not alongside ──────────────────────────────
--
-- Nothing else in the product reads that word — verified: no SQL, no
-- report, no analytics; the runner's difficulty pill is its only reader.
-- For an unmeasured item the number encodes the word exactly (the §5.1
-- seeds sit dead-centre of their §5.5.1 bands), so nothing is lost. For
-- a measured one the word is stale by definition, so keeping it would
-- only preserve the drift this slice exists to remove.
--
-- ── Ten sites, not six ──────────────────────────────────────────────
--
-- §5.5.2b describes this as "six functions, one substitution each". It
-- is six functions and TEN lines:
--
--   nclex_create_attempt                  2 — a standalone question and
--                                             a case child are frozen by
--                                             two separate builders
--   nclex_create_readiness_attempt        2 — likewise
--   nclex_create_programme_attempt        2 — snapshot + the tutor-question
--                                             SELECT list that feeds it
--   nclex_create_standalone_quiz_attempt  2 — likewise
--   create_cat_attempt                    1
--   cat_next_item                         1
--
-- Missing the case-child branch would have left every case question —
-- six per case study — with a blank difficulty pill.
--
-- ── How these bodies were produced ──────────────────────────────────
--
-- Not retyped. Each live definition was read with pg_get_functiondef(),
-- the exact target strings replaced under an assertion on the number of
-- occurrences (10 expected, 10 applied), executed, and the result dumped
-- back to this file verbatim. So these bodies differ from their previous
-- definitions in exactly those ten lines and nowhere else.
--
-- ── What is NOT here ────────────────────────────────────────────────
--
-- The dev backfill of existing snapshots. Prod has zero attempt rows, so
-- a backfill here would be a permanent no-op in the migration history;
-- dev's 1,636 test rows were translated by a one-off statement instead.
--
-- `cat_item_difficulty` is unchanged. It has fed from `difficulty_irt`
-- since Slice 1 and is the engine's own audit record of what the
-- arithmetic used. A CAT row therefore holds the number twice — accepted
-- rather than tolerated, because both copies are written in the same
-- INSERT from the same variable and so cannot diverge.
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.nclex_create_attempt(p_filters jsonb, p_mode text, p_intent text, p_requested_count integer, p_source text DEFAULT 'CUSTOM_BUILT'::text)
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
        tabs_snapshot_json
      )
      SELECT v_attempt_id, td.trend_id, td.title, td.scenario,
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
          'difficulty_irt',           bi.difficulty_irt,
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
            'difficulty_irt',           r_child.difficulty_irt,
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
$function$
;
CREATE OR REPLACE FUNCTION public.nclex_create_programme_attempt(p_programme_activity_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student      UUID := auth.uid();
  v_attempt_id   UUID;
  v_activity     RECORD;
  v_quiz         RECORD;
  v_quiz_id      UUID;
  v_taken        INTEGER;
  v_position     INTEGER := 0;
  v_running      INTEGER := 0;
  r_item         RECORD;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT a.activity_id, a.type, a.is_published, a.payload, u.programme_id
    INTO v_activity
  FROM nclex_programme_activities a
  JOIN nclex_programme_units u ON u.unit_id = a.unit_id
  WHERE a.activity_id = p_programme_activity_id;

  IF v_activity.activity_id IS NULL THEN
    RAISE EXCEPTION 'activity not found';
  END IF;
  IF v_activity.type NOT IN ('MOCK', 'PRACTICE_QUIZ') THEN
    RAISE EXCEPTION 'activity is not a quiz';
  END IF;
  IF v_activity.is_published IS NOT TRUE THEN
    RAISE EXCEPTION 'activity is not published';
  END IF;

  IF NOT (
    nclex_has_active_programme_enrolment(v_activity.programme_id)
    OR nclex_user_has_role('SUPER_ADMIN')
  ) THEN
    RAISE EXCEPTION 'not enrolled in this programme';
  END IF;

  v_quiz_id := NULLIF(v_activity.payload->>'quiz_id', '')::UUID;
  IF v_quiz_id IS NULL THEN
    RAISE EXCEPTION 'this activity has no quiz linked yet';
  END IF;

  SELECT quiz_id, quiz_kind, mode, duration_seconds, pass_score, max_attempts, status
    INTO v_quiz
  FROM nclex_tutor_quizzes
  WHERE quiz_id = v_quiz_id;

  IF v_quiz.quiz_id IS NULL THEN
    RAISE EXCEPTION 'linked quiz not found';
  END IF;
  IF v_quiz.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'linked quiz is not published';
  END IF;

  IF v_quiz.max_attempts IS NOT NULL THEN
    SELECT COUNT(*)::INTEGER INTO v_taken
    FROM nclex_attempts
    WHERE student_id = v_student
      AND programme_activity_id = p_programme_activity_id::TEXT
      AND status IN ('COMPLETED', 'TIMED_OUT', 'ABANDONED');
    IF v_taken >= v_quiz.max_attempts THEN
      RAISE EXCEPTION 'no attempts remaining for this quiz';
    END IF;
  END IF;

  INSERT INTO nclex_attempts (
    student_id, source, intent, mode, duration_seconds, pass_score,
    filters_json, programme_activity_id, requested_question_count,
    actual_question_count, actual_unit_count
  ) VALUES (
    v_student, 'PROGRAMME_ASSIGNED',
    CASE v_quiz.quiz_kind WHEN 'MOCK' THEN 'EXAM' ELSE 'STUDY' END,
    v_quiz.mode, v_quiz.duration_seconds, v_quiz.pass_score,
    '{}'::jsonb, p_programme_activity_id::TEXT,
    (SELECT COUNT(*)::INTEGER FROM nclex_tutor_quiz_items WHERE quiz_id = v_quiz_id),
    0, 0
  )
  RETURNING attempt_id INTO v_attempt_id;

  FOR r_item IN
    SELECT tqi.position AS quiz_position, tq.item_id, tq.tutor_id,
      tq.question_type, tq.stem, tq.instruction, tq.rationale, tq.rationale_img,
      tq.marks, tq.client_needs_category, tq.client_needs_subcategory,
      tq.nursing_subject, tq.body_system, tq.topic, tq.subtopic, tq.difficulty_irt,
      tq.tags, tq.content, tq.correct
    FROM nclex_tutor_quiz_items tqi
    JOIN nclex_tutor_questions tq ON tq.item_id = tqi.item_id
    WHERE tqi.quiz_id = v_quiz_id
    ORDER BY tqi.position ASC
  LOOP
    v_position := v_position + 1;
    INSERT INTO nclex_attempt_items (
      attempt_id, position, item_id, item_source, tutor_id,
      selection_unit_type, selection_unit_id,
      question_type, stem_snapshot, instruction_snapshot,
      rationale_snapshot, rationale_img_snapshot,
      marks_snapshot, classification_snapshot,
      content_snapshot_json, correct_answer_snapshot_json, option_order_json
    ) VALUES (
      v_attempt_id, v_position, r_item.item_id, 'TUTOR', r_item.tutor_id,
      'QUESTION', r_item.item_id,
      r_item.question_type, r_item.stem, r_item.instruction,
      r_item.rationale, r_item.rationale_img,
      COALESCE(r_item.marks, 1),
      jsonb_build_object(
        'client_needs_category',    r_item.client_needs_category,
        'client_needs_subcategory', r_item.client_needs_subcategory,
        'nursing_subject',          r_item.nursing_subject,
        'body_system',              r_item.body_system,
        'topic',                    r_item.topic,
        'subtopic',                 r_item.subtopic,
        'difficulty_irt',           r_item.difficulty_irt,
        'tags',                     to_jsonb(r_item.tags)
      ),
      COALESCE(r_item.content, '{}'::jsonb),
      COALESCE(r_item.correct, '{}'::jsonb),
      '{}'::jsonb
    );
    v_running := v_running + 1;
  END LOOP;

  IF v_running = 0 THEN
    RAISE EXCEPTION 'linked quiz has no questions';
  END IF;

  UPDATE nclex_attempts
  SET actual_question_count = v_running, actual_unit_count = v_running, updated_at = NOW()
  WHERE attempt_id = v_attempt_id;

  RETURN v_attempt_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.nclex_create_standalone_quiz_attempt(p_programme_id uuid, p_quiz_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student      UUID := auth.uid();
  v_attempt_id   UUID;
  v_programme    RECORD;
  v_junction     RECORD;
  v_quiz         RECORD;
  v_taken        INTEGER;
  v_position     INTEGER := 0;
  v_running      INTEGER := 0;
  r_item         RECORD;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT programme_id, status INTO v_programme
  FROM nclex_programmes WHERE programme_id = p_programme_id;

  IF v_programme.programme_id IS NULL THEN
    RAISE EXCEPTION 'programme not found';
  END IF;
  IF v_programme.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'programme is not published';
  END IF;

  IF NOT (
    nclex_has_active_programme_enrolment(p_programme_id)
    OR nclex_user_has_role('SUPER_ADMIN')
  ) THEN
    RAISE EXCEPTION 'not enrolled in this programme';
  END IF;

  SELECT programme_id, quiz_id INTO v_junction
  FROM nclex_programme_quizzes
  WHERE programme_id = p_programme_id AND quiz_id = p_quiz_id;

  IF v_junction.programme_id IS NULL THEN
    RAISE EXCEPTION 'this quiz is not in this programme';
  END IF;

  SELECT quiz_id, quiz_kind, mode, duration_seconds, pass_score, max_attempts, status
    INTO v_quiz
  FROM nclex_tutor_quizzes WHERE quiz_id = p_quiz_id;

  IF v_quiz.quiz_id IS NULL THEN
    RAISE EXCEPTION 'quiz not found';
  END IF;
  IF v_quiz.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'quiz is not published';
  END IF;

  IF v_quiz.max_attempts IS NOT NULL THEN
    SELECT COUNT(*)::INTEGER INTO v_taken
    FROM nclex_attempts
    WHERE student_id = v_student
      AND source = 'PROGRAMME_ASSIGNED'
      AND programme_activity_id IS NULL
      AND programme_id = p_programme_id
      AND quiz_id = p_quiz_id
      AND status IN ('COMPLETED', 'TIMED_OUT', 'ABANDONED');
    IF v_taken >= v_quiz.max_attempts THEN
      RAISE EXCEPTION 'no attempts remaining for this quiz';
    END IF;
  END IF;

  INSERT INTO nclex_attempts (
    student_id, source, intent, mode, duration_seconds, pass_score,
    filters_json, programme_activity_id, programme_id, quiz_id,
    requested_question_count, actual_question_count, actual_unit_count
  ) VALUES (
    v_student, 'PROGRAMME_ASSIGNED',
    CASE v_quiz.quiz_kind WHEN 'MOCK' THEN 'EXAM' ELSE 'STUDY' END,
    v_quiz.mode, v_quiz.duration_seconds, v_quiz.pass_score,
    '{}'::jsonb, NULL, p_programme_id, p_quiz_id,
    (SELECT COUNT(*)::INTEGER FROM nclex_tutor_quiz_items WHERE quiz_id = p_quiz_id),
    0, 0
  )
  RETURNING attempt_id INTO v_attempt_id;

  FOR r_item IN
    SELECT tqi.position AS quiz_position, tq.item_id, tq.tutor_id,
      tq.question_type, tq.stem, tq.instruction, tq.rationale, tq.rationale_img,
      tq.marks, tq.client_needs_category, tq.client_needs_subcategory,
      tq.nursing_subject, tq.body_system, tq.topic, tq.subtopic, tq.difficulty_irt,
      tq.tags, tq.content, tq.correct
    FROM nclex_tutor_quiz_items tqi
    JOIN nclex_tutor_questions tq ON tq.item_id = tqi.item_id
    WHERE tqi.quiz_id = p_quiz_id
    ORDER BY tqi.position ASC
  LOOP
    v_position := v_position + 1;
    INSERT INTO nclex_attempt_items (
      attempt_id, position, item_id, item_source, tutor_id,
      selection_unit_type, selection_unit_id,
      question_type, stem_snapshot, instruction_snapshot,
      rationale_snapshot, rationale_img_snapshot,
      marks_snapshot, classification_snapshot,
      content_snapshot_json, correct_answer_snapshot_json, option_order_json
    ) VALUES (
      v_attempt_id, v_position, r_item.item_id, 'TUTOR', r_item.tutor_id,
      'QUESTION', r_item.item_id,
      r_item.question_type, r_item.stem, r_item.instruction,
      r_item.rationale, r_item.rationale_img,
      COALESCE(r_item.marks, 1),
      jsonb_build_object(
        'client_needs_category',    r_item.client_needs_category,
        'client_needs_subcategory', r_item.client_needs_subcategory,
        'nursing_subject',          r_item.nursing_subject,
        'body_system',              r_item.body_system,
        'topic',                    r_item.topic,
        'subtopic',                 r_item.subtopic,
        'difficulty_irt',           r_item.difficulty_irt,
        'tags',                     to_jsonb(r_item.tags)
      ),
      COALESCE(r_item.content, '{}'::jsonb),
      COALESCE(r_item.correct, '{}'::jsonb),
      '{}'::jsonb
    );
    v_running := v_running + 1;
  END LOOP;

  IF v_running = 0 THEN
    RAISE EXCEPTION 'quiz has no questions';
  END IF;

  UPDATE nclex_attempts
  SET actual_question_count = v_running, actual_unit_count = v_running, updated_at = NOW()
  WHERE attempt_id = v_attempt_id;

  RETURN v_attempt_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.nclex_create_readiness_attempt(p_pack_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student    UUID := auth.uid();
  v_attempt_id UUID;
  v_existing   UUID;
  v_n          INTEGER;
  v_duration   INTEGER;
  v_published  BOOLEAN;
  v_status     TEXT;
  v_position   INTEGER := 0;
  v_count      INTEGER := 0;
  v_units      INTEGER := 0;
  v_prev_case  TEXT := NULL;
  r_mem        RECORD;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT n, time_limit_sec, published, status
  INTO v_n, v_duration, v_published, v_status
  FROM nclex_readiness_packs
  WHERE pack_id = p_pack_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pack not found: %', p_pack_id;
  END IF;
  IF v_published IS NOT TRUE OR v_status <> 'active' THEN
    RAISE EXCEPTION 'pack is not available: %', p_pack_id;
  END IF;
  IF v_duration IS NULL OR v_duration <= 0 THEN
    RAISE EXCEPTION 'pack has no time limit: %', p_pack_id;
  END IF;

  PERFORM 1
  FROM nclex_readiness_credits
  WHERE user_id = v_student
    AND pack_id = p_pack_id
    AND activated_at IS NOT NULL
    AND used_at     IS NULL
    AND expired_at  IS NULL
    AND revoked_at  IS NULL
    AND expires_at  > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active readiness credit for this pack'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT attempt_id INTO v_existing
  FROM nclex_attempts
  WHERE student_id       = v_student
    AND source           = 'READINESS_PACK'
    AND readiness_pack_id = p_pack_id
    AND status           = 'IN_PROGRESS'
    AND started_at       IS NULL
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO nclex_attempts (
    student_id, source, readiness_pack_id, intent, mode, duration_seconds,
    filters_json, requested_question_count, actual_question_count, actual_unit_count
  ) VALUES (
    v_student, 'READINESS_PACK', p_pack_id, 'EXAM', 'TIMED_SEQUENTIAL', v_duration,
    '{}'::jsonb, GREATEST(COALESCE(v_n, 0), 1), 0, 0
  )
  RETURNING attempt_id INTO v_attempt_id;

  FOR r_mem IN
    SELECT bi.*,
           csi.case_id  AS csi_case,
           csi.position AS csi_pos,
           csi.cjmm_step AS csi_step
    FROM nclex_readiness_pack_items i
    JOIN nclex_bank_items bi ON bi.item_id = i.item_id
    LEFT JOIN nclex_case_study_items csi ON csi.item_id = i.item_id
    WHERE i.pack_id = p_pack_id
    ORDER BY i.position
  LOOP
    v_position := v_position + 1;

    IF r_mem.csi_case IS NOT NULL THEN
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
      FROM nclex_case_studies cs
      WHERE cs.case_id = r_mem.csi_case
      ON CONFLICT (attempt_id, case_id) DO NOTHING;

      IF r_mem.csi_case IS DISTINCT FROM v_prev_case THEN
        v_units := v_units + 1;
        v_prev_case := r_mem.csi_case;
      END IF;

      INSERT INTO nclex_attempt_items (
        attempt_id, position, item_id, item_source,
        selection_unit_type, selection_unit_id,
        parent_case_id, case_position, cjmm_step, trend_id,
        question_type, stem_snapshot, instruction_snapshot,
        rationale_snapshot, rationale_img_snapshot,
        marks_snapshot, classification_snapshot,
        content_snapshot_json, correct_answer_snapshot_json, option_order_json
      ) VALUES (
        v_attempt_id, v_position, r_mem.item_id, 'BANK',
        'CASE', r_mem.csi_case,
        r_mem.csi_case, r_mem.csi_pos, r_mem.csi_step, r_mem.trend_id,
        r_mem.question_type, r_mem.stem, r_mem.instruction,
        r_mem.rationale, r_mem.rationale_img,
        COALESCE(r_mem.marks, 1),
        jsonb_build_object(
          'client_needs_category',    r_mem.client_needs_category,
          'client_needs_subcategory', r_mem.client_needs_subcategory,
          'nursing_subject',          r_mem.nursing_subject,
          'body_system',              r_mem.body_system,
          'topic',                    r_mem.topic,
          'subtopic',                 r_mem.subtopic,
          'difficulty_irt',           r_mem.difficulty_irt,
          'tags',                     to_jsonb(r_mem.tags)
        ),
        COALESCE(r_mem.content, '{}'::jsonb),
        COALESCE(r_mem.correct, '{}'::jsonb),
        '{}'::jsonb
      );

    ELSE
      IF r_mem.trend_id IS NOT NULL THEN
        INSERT INTO nclex_attempt_trend_snapshots (
          attempt_id, trend_id, title_snapshot, scenario_snapshot, tabs_snapshot_json
        )
        SELECT
          v_attempt_id, td.trend_id, td.title, td.scenario,
          COALESCE(
            (SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.display_order)
             FROM nclex_trend_tabs t
             WHERE t.trend_id = td.trend_id),
            '[]'::jsonb
          )
        FROM nclex_trend_datasets td
        WHERE td.trend_id = r_mem.trend_id
        ON CONFLICT (attempt_id, trend_id) DO NOTHING;
      END IF;

      v_units := v_units + 1;

      INSERT INTO nclex_attempt_items (
        attempt_id, position, item_id, item_source,
        selection_unit_type, selection_unit_id, trend_id,
        question_type, stem_snapshot, instruction_snapshot,
        rationale_snapshot, rationale_img_snapshot,
        marks_snapshot, classification_snapshot,
        content_snapshot_json, correct_answer_snapshot_json, option_order_json
      ) VALUES (
        v_attempt_id, v_position, r_mem.item_id, 'BANK',
        'QUESTION', r_mem.item_id, r_mem.trend_id,
        r_mem.question_type, r_mem.stem, r_mem.instruction,
        r_mem.rationale, r_mem.rationale_img,
        COALESCE(r_mem.marks, 1),
        jsonb_build_object(
          'client_needs_category',    r_mem.client_needs_category,
          'client_needs_subcategory', r_mem.client_needs_subcategory,
          'nursing_subject',          r_mem.nursing_subject,
          'body_system',              r_mem.body_system,
          'topic',                    r_mem.topic,
          'subtopic',                 r_mem.subtopic,
          'difficulty_irt',           r_mem.difficulty_irt,
          'tags',                     to_jsonb(r_mem.tags)
        ),
        COALESCE(r_mem.content, '{}'::jsonb),
        COALESCE(r_mem.correct, '{}'::jsonb),
        '{}'::jsonb
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'pack has no members: %', p_pack_id;
  END IF;

  UPDATE nclex_attempts
  SET actual_question_count = v_count,
      actual_unit_count     = v_units,
      updated_at            = NOW()
  WHERE attempt_id = v_attempt_id;

  RETURN v_attempt_id;
END;
$function$
;
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
      'difficulty_irt', v_item.difficulty_irt, 'tags', to_jsonb(v_item.tags)),
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
$function$
;
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
        AND (bi.trend_id IS NULL OR EXISTS (SELECT 1 FROM nclex_trend_datasets td WHERE td.trend_id = bi.trend_id AND td.is_published IS TRUE))
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
          AND (bi.trend_id IS NULL OR EXISTS (SELECT 1 FROM nclex_trend_datasets td WHERE td.trend_id = bi.trend_id AND td.is_published IS TRUE))
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
      'difficulty_irt', v_item.difficulty_irt, 'tags', to_jsonb(v_item.tags)),
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
$function$
;