-- =========================================================
-- MyNclex — Enrolments, access-gating step
-- File: mynclex/db/migrations/20260526120000_enrolments_access_gating.sql
-- =========================================================
-- The follow-on to Slices 1/2a/2b. Slice 2b made enrolment status
-- *visible* (pills in the switcher) but access was still permissive —
-- every PUBLISHED programme was readable by any STUDENT. This migration
-- makes status actually CONTROL access.
--
-- Source of truth:
--   docs/product-plan/payments-and-enrolment.md
--     · "Enrolment row lifecycle"  (only ENROLLED grants content access)
--     · "Programme access window"  (archived programmes stay readable to
--                                    already-enrolled students)
--
-- Two visibility tiers (the key design idea):
--   • METADATA tier — programme + cohort identity. Readable if the
--     student has ANY enrolment row (active OR terminal). Powers the
--     switcher's status tiles (a PAUSED/CANCELLED student still sees the
--     programme name + its pill) without exposing curriculum content.
--   • CONTENT tier — units, blocks, activities, cohort checklist,
--     quizzes. Readable only with an ENROLLED row. This is the real gate.
--
-- Why metadata tier drops the old `status = 'PUBLISHED'` check entirely:
-- an enrolment can only have been created against a once-PUBLISHED
-- programme, and the access window keeps an already-enrolled student's
-- access alive after the tutor ARCHIVES the programme (planning:
-- "Existing enrolled students retain access until their access window
-- expires"). Gating on PUBLISHED would wrongly lock them out. Public
-- discovery of PUBLISHED-but-not-enrolled programmes is a separate
-- surface (Slice 3) — not this policy.
--
-- The two student launch RPCs (nclex_create_programme_attempt,
-- nclex_create_standalone_quiz_attempt) are SECURITY DEFINER and bypass
-- RLS, so tightening policies alone does NOT close them. Each gains an
-- active-enrolment guard (with a SUPER_ADMIN bypass for QA preview).
--
-- Mirrored into db/rls.sql.


-- =========================================================
-- 1. Enrolment helper functions (SECURITY DEFINER)
-- =========================================================
-- Same pattern as nclex_user_has_role: SECURITY DEFINER so the EXISTS
-- against nclex_enrolments isn't re-filtered by that table's own RLS
-- (and so a student_select policy referencing enrolments can't recurse).
-- auth.uid() inside a SECURITY DEFINER function still reads the caller's
-- JWT, so "this student" is correct.

CREATE OR REPLACE FUNCTION nclex_has_programme_enrolment(p_programme_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM nclex_enrolments e
    WHERE e.programme_id = p_programme_id
      AND e.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION nclex_has_active_programme_enrolment(p_programme_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM nclex_enrolments e
    WHERE e.programme_id = p_programme_id
      AND e.user_id = auth.uid()
      AND e.status = 'ENROLLED'
  );
$$;

CREATE OR REPLACE FUNCTION nclex_has_cohort_enrolment(p_cohort_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM nclex_enrolments e
    WHERE e.cohort_id = p_cohort_id
      AND e.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION nclex_has_active_cohort_enrolment(p_cohort_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM nclex_enrolments e
    WHERE e.cohort_id = p_cohort_id
      AND e.user_id = auth.uid()
      AND e.status = 'ENROLLED'
  );
$$;


-- =========================================================
-- 2. Metadata tier — programmes + cohorts (any enrolment)
-- =========================================================

DROP POLICY IF EXISTS nclex_programmes_student_select ON nclex_programmes;
CREATE POLICY nclex_programmes_student_select ON nclex_programmes FOR SELECT
  TO authenticated
  USING (nclex_has_programme_enrolment(programme_id));

DROP POLICY IF EXISTS nclex_cohorts_student_select ON nclex_cohorts;
CREATE POLICY nclex_cohorts_student_select ON nclex_cohorts FOR SELECT
  TO authenticated
  USING (nclex_has_cohort_enrolment(cohort_id));


-- =========================================================
-- 3. Content tier — units / blocks / activities (active programme
--    enrolment). Curriculum is programme-shared; a tutor-led student's
--    cohort enrolment row carries programme_id, so the programme-level
--    check covers both delivery modes.
-- =========================================================

DROP POLICY IF EXISTS nclex_programme_units_student_select ON nclex_programme_units;
CREATE POLICY nclex_programme_units_student_select
  ON nclex_programme_units FOR SELECT
  TO authenticated
  USING (nclex_has_active_programme_enrolment(programme_id));

DROP POLICY IF EXISTS nclex_programme_blocks_student_select ON nclex_programme_blocks;
CREATE POLICY nclex_programme_blocks_student_select
  ON nclex_programme_blocks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programme_units u
      WHERE u.unit_id = nclex_programme_blocks.unit_id
        AND nclex_has_active_programme_enrolment(u.programme_id)
    )
  );

DROP POLICY IF EXISTS nclex_programme_activities_student_select ON nclex_programme_activities;
CREATE POLICY nclex_programme_activities_student_select
  ON nclex_programme_activities FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programme_units u
      WHERE u.unit_id = nclex_programme_activities.unit_id
        AND nclex_has_active_programme_enrolment(u.programme_id)
    )
  );


-- =========================================================
-- 4. Content tier — cohort checklist (active cohort enrolment)
-- =========================================================

DROP POLICY IF EXISTS nclex_cohort_checklist_items_student_select ON nclex_cohort_checklist_items;
CREATE POLICY nclex_cohort_checklist_items_student_select
  ON nclex_cohort_checklist_items FOR SELECT
  TO authenticated
  USING (nclex_has_active_cohort_enrolment(cohort_id));


-- =========================================================
-- 5. Content tier — quizzes (active programme enrolment)
-- =========================================================
-- tutor_quizzes: still requires the quiz itself PUBLISHED, but the
-- attachment must be to a programme the student is ACTIVELY enrolled in
-- (was: any PUBLISHED programme).

DROP POLICY IF EXISTS nclex_tutor_quizzes_student_select ON nclex_tutor_quizzes;
CREATE POLICY nclex_tutor_quizzes_student_select
  ON nclex_tutor_quizzes FOR SELECT
  TO authenticated
  USING (
    status = 'PUBLISHED'
    AND EXISTS (
      SELECT 1 FROM nclex_programme_quizzes pq
      WHERE pq.quiz_id = nclex_tutor_quizzes.quiz_id
        AND nclex_has_active_programme_enrolment(pq.programme_id)
    )
  );

DROP POLICY IF EXISTS nclex_programme_quizzes_student_select ON nclex_programme_quizzes;
CREATE POLICY nclex_programme_quizzes_student_select
  ON nclex_programme_quizzes FOR SELECT
  TO authenticated
  USING (nclex_has_active_programme_enrolment(programme_id));


-- =========================================================
-- 6. Launch RPCs — add active-enrolment guard
-- =========================================================
-- Both are SECURITY DEFINER (bypass RLS), so the policy tightening
-- above doesn't reach them. Each now requires an active programme
-- enrolment, with a SUPER_ADMIN bypass so admin/tutor QA preview keeps
-- working. Bodies are otherwise unchanged from their original slices
-- (tutor_quiz_3 / tutor_quiz_6); only the guard block is new, plus
-- nclex_create_programme_attempt now resolves programme_id via the
-- activity's unit so it can run the check.

CREATE OR REPLACE FUNCTION nclex_create_programme_attempt(
  p_programme_activity_id UUID
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
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
  -- 1. Auth.
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- 2. Read activity (+ its programme via the unit). SECURITY DEFINER
  --    bypasses RLS, so we read columns directly and gate on type +
  --    is_published ourselves. A nonexistent or wrong-type row is a
  --    generic error — never leak which it was.
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

  -- 2b. Enrolment gate. The student must hold an ENROLLED enrolment in
  --     the activity's programme. SUPER_ADMIN bypasses for QA preview.
  IF NOT (
    nclex_has_active_programme_enrolment(v_activity.programme_id)
    OR nclex_user_has_role('SUPER_ADMIN')
  ) THEN
    RAISE EXCEPTION 'not enrolled in this programme';
  END IF;

  -- 3. Extract quiz_id from payload (JSONB).
  v_quiz_id := NULLIF(v_activity.payload->>'quiz_id', '')::UUID;
  IF v_quiz_id IS NULL THEN
    RAISE EXCEPTION 'this activity has no quiz linked yet';
  END IF;

  -- 4. Read quiz; assert PUBLISHED.
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

  -- 5. max_attempts check — count this student's terminal attempts
  --    on THIS activity. IN_PROGRESS is excluded (resume handles
  --    that). Terminal = COMPLETED + TIMED_OUT + ABANDONED.
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

  -- 6. Insert the attempt header.
  INSERT INTO nclex_attempts (
    student_id,
    source,
    intent,
    mode,
    duration_seconds,
    pass_score,
    filters_json,
    programme_activity_id,
    requested_question_count,
    actual_question_count,
    actual_unit_count
  ) VALUES (
    v_student,
    'PROGRAMME_ASSIGNED',
    CASE v_quiz.quiz_kind WHEN 'MOCK' THEN 'EXAM' ELSE 'STUDY' END,
    v_quiz.mode,
    v_quiz.duration_seconds,
    v_quiz.pass_score,
    '{}'::jsonb,
    p_programme_activity_id::TEXT,
    (SELECT COUNT(*)::INTEGER FROM nclex_tutor_quiz_items WHERE quiz_id = v_quiz_id),
    0,
    0
  )
  RETURNING attempt_id INTO v_attempt_id;

  -- 7. Snapshot the quiz's questions in position order.
  FOR r_item IN
    SELECT
      tqi.position AS quiz_position,
      tq.item_id,
      tq.tutor_id,
      tq.question_type,
      tq.stem,
      tq.instruction,
      tq.rationale,
      tq.rationale_img,
      tq.marks,
      tq.client_needs_category,
      tq.client_needs_subcategory,
      tq.nursing_subject,
      tq.body_system,
      tq.topic,
      tq.subtopic,
      tq.difficulty,
      tq.tags,
      tq.content,
      tq.correct
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
      content_snapshot_json, correct_answer_snapshot_json,
      option_order_json
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
        'difficulty',               r_item.difficulty,
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

  -- 8. Update counters.
  UPDATE nclex_attempts
  SET actual_question_count = v_running,
      actual_unit_count     = v_running,
      updated_at            = NOW()
  WHERE attempt_id = v_attempt_id;

  RETURN v_attempt_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION nclex_create_programme_attempt(UUID)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION nclex_create_programme_attempt(UUID)
  TO authenticated;


CREATE OR REPLACE FUNCTION nclex_create_standalone_quiz_attempt(
  p_programme_id UUID,
  p_quiz_id      UUID
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
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
  -- 1. Auth.
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- 2. Programme exists + PUBLISHED.
  SELECT programme_id, status INTO v_programme
  FROM nclex_programmes
  WHERE programme_id = p_programme_id;

  IF v_programme.programme_id IS NULL THEN
    RAISE EXCEPTION 'programme not found';
  END IF;
  IF v_programme.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'programme is not published';
  END IF;

  -- 2b. Enrolment gate — active enrolment in this programme, or
  --     SUPER_ADMIN for QA preview.
  IF NOT (
    nclex_has_active_programme_enrolment(p_programme_id)
    OR nclex_user_has_role('SUPER_ADMIN')
  ) THEN
    RAISE EXCEPTION 'not enrolled in this programme';
  END IF;

  -- 3. Quiz is attached to this programme via the junction.
  SELECT programme_id, quiz_id INTO v_junction
  FROM nclex_programme_quizzes
  WHERE programme_id = p_programme_id
    AND quiz_id      = p_quiz_id;

  IF v_junction.programme_id IS NULL THEN
    RAISE EXCEPTION 'this quiz is not in this programme';
  END IF;

  -- 4. Quiz exists + PUBLISHED.
  SELECT quiz_id, quiz_kind, mode, duration_seconds, pass_score, max_attempts, status
    INTO v_quiz
  FROM nclex_tutor_quizzes
  WHERE quiz_id = p_quiz_id;

  IF v_quiz.quiz_id IS NULL THEN
    RAISE EXCEPTION 'quiz not found';
  END IF;
  IF v_quiz.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'quiz is not published';
  END IF;

  -- 5. §9.7-B cap — per-(student, quiz, programme) terminal attempts
  --    on STANDALONE rows (NULL programme_activity_id).
  IF v_quiz.max_attempts IS NOT NULL THEN
    SELECT COUNT(*)::INTEGER INTO v_taken
    FROM nclex_attempts
    WHERE student_id = v_student
      AND source     = 'PROGRAMME_ASSIGNED'
      AND programme_activity_id IS NULL
      AND programme_id = p_programme_id
      AND quiz_id      = p_quiz_id
      AND status IN ('COMPLETED', 'TIMED_OUT', 'ABANDONED');
    IF v_taken >= v_quiz.max_attempts THEN
      RAISE EXCEPTION 'no attempts remaining for this quiz';
    END IF;
  END IF;

  -- 6. Insert attempt header.
  INSERT INTO nclex_attempts (
    student_id,
    source,
    intent,
    mode,
    duration_seconds,
    pass_score,
    filters_json,
    programme_activity_id,
    programme_id,
    quiz_id,
    requested_question_count,
    actual_question_count,
    actual_unit_count
  ) VALUES (
    v_student,
    'PROGRAMME_ASSIGNED',
    CASE v_quiz.quiz_kind WHEN 'MOCK' THEN 'EXAM' ELSE 'STUDY' END,
    v_quiz.mode,
    v_quiz.duration_seconds,
    v_quiz.pass_score,
    '{}'::jsonb,
    NULL,
    p_programme_id,
    p_quiz_id,
    (SELECT COUNT(*)::INTEGER FROM nclex_tutor_quiz_items WHERE quiz_id = p_quiz_id),
    0,
    0
  )
  RETURNING attempt_id INTO v_attempt_id;

  -- 7. Snapshot the quiz's questions in position order.
  FOR r_item IN
    SELECT
      tqi.position AS quiz_position,
      tq.item_id,
      tq.tutor_id,
      tq.question_type,
      tq.stem,
      tq.instruction,
      tq.rationale,
      tq.rationale_img,
      tq.marks,
      tq.client_needs_category,
      tq.client_needs_subcategory,
      tq.nursing_subject,
      tq.body_system,
      tq.topic,
      tq.subtopic,
      tq.difficulty,
      tq.tags,
      tq.content,
      tq.correct
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
      content_snapshot_json, correct_answer_snapshot_json,
      option_order_json
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
        'difficulty',               r_item.difficulty,
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

  -- 8. Update counters.
  UPDATE nclex_attempts
  SET actual_question_count = v_running,
      actual_unit_count     = v_running,
      updated_at            = NOW()
  WHERE attempt_id = v_attempt_id;

  RETURN v_attempt_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION nclex_create_standalone_quiz_attempt(UUID, UUID)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION nclex_create_standalone_quiz_attempt(UUID, UUID)
  TO authenticated;
