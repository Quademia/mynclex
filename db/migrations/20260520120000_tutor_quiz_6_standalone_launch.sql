-- =========================================================
-- MyNclex — Tutor Quiz, Slice 6: Standalone quiz launch
-- File: mynclex/db/migrations/20260520120000_tutor_quiz_6_standalone_launch.sql
-- =========================================================
-- Closes the tutor-quiz arc by adding the student-side launch path
-- for STANDALONE programme quizzes — quizzes attached directly to
-- a programme via the §9.1 junction with no curriculum activity to
-- point at.
--
-- Two pieces:
--   1. nclex_attempts gains nullable quiz_id + programme_id
--      columns and a relaxed source_refs CHECK that allows the
--      standalone shape: source = 'PROGRAMME_ASSIGNED' with
--      programme_activity_id NULL and (programme_id, quiz_id) NOT
--      NULL. Activity-linked attempts keep their existing shape
--      (programme_activity_id NOT NULL, quiz_id + programme_id
--      NULL).
--
--   2. New RPC nclex_create_standalone_quiz_attempt(programme_id,
--      quiz_id) — mirrors nclex_create_programme_attempt's
--      snapshot machinery but driven by (programme + quiz) instead
--      of an activity. Enforces the §9.7-B cap: per-(student, quiz,
--      programme) — terminal attempts of THIS quiz in THIS programme.
--
-- Source of truth for shape + semantics:
--   docs/product-plan/tutor-quiz-system.md §9.5 (student surface)
--   docs/product-plan/tutor-quiz-system.md §9.7 (settled to B)
--
-- Routing decision settled with Sam (2026-05-16):
--   Slice 6 student rows that are ALSO activity-linked (per the
--   §9.2 LEFT JOIN derivation) route their launch through the
--   EXISTING activity-linked RPC (nclex_create_programme_attempt)
--   resolving the primary activity, not through this standalone
--   RPC. This new RPC is for genuinely-standalone rows only.
--   Result: one cap per row, matching what the student would see
--   if they launched from Curriculum.


-- =========================================================
-- 1. nclex_attempts.quiz_id + .programme_id
-- =========================================================
-- Populated only for genuinely-standalone attempts. Existing
-- activity-linked rows keep both columns NULL; the derived
-- (programme, quiz) tuple is reachable via the activity JOIN.

ALTER TABLE nclex_attempts
  ADD COLUMN programme_id UUID
    REFERENCES nclex_programmes(programme_id) ON DELETE SET NULL;

ALTER TABLE nclex_attempts
  ADD COLUMN quiz_id UUID
    REFERENCES nclex_tutor_quizzes(quiz_id) ON DELETE SET NULL;


-- Relax the source_refs CHECK to allow the standalone shape.
-- Drop the existing constraint (3-branch) and replace with a
-- 4-branch version: the PROGRAMME_ASSIGNED branch now permits
-- either activity-linked OR standalone, with mutually-exclusive
-- column expectations on each side.

ALTER TABLE nclex_attempts DROP CONSTRAINT nclex_attempts_source_refs;

ALTER TABLE nclex_attempts ADD CONSTRAINT nclex_attempts_source_refs CHECK (
  (
    source = 'CUSTOM_BUILT'
    AND readiness_pack_id IS NULL
    AND programme_activity_id IS NULL
    AND programme_id IS NULL
    AND quiz_id IS NULL
  )
  OR (
    source = 'READINESS_PACK'
    AND readiness_pack_id IS NOT NULL
    AND programme_activity_id IS NULL
    AND programme_id IS NULL
    AND quiz_id IS NULL
  )
  OR (
    source = 'PROGRAMME_ASSIGNED'
    AND (
      -- Activity-linked (pre-Slice 6 shape; still the default).
      (programme_activity_id IS NOT NULL AND programme_id IS NULL AND quiz_id IS NULL)
      OR
      -- Standalone (Slice 6). programme_id + quiz_id identify the
      -- target; no activity row mediates.
      (programme_activity_id IS NULL AND programme_id IS NOT NULL AND quiz_id IS NOT NULL)
    )
  )
);


-- Index for the standalone cap-count query in the new RPC. Partial
-- index — the activity-linked branch keeps its own activity-scoped
-- index (slice 2.1).
CREATE INDEX idx_nclex_attempts_standalone_quiz
  ON nclex_attempts(student_id, programme_id, quiz_id)
  WHERE source = 'PROGRAMME_ASSIGNED' AND programme_activity_id IS NULL;


-- =========================================================
-- 2. nclex_create_standalone_quiz_attempt
-- =========================================================
-- Student clicks Start on a standalone-only Slice 6 row. Validates,
-- snapshots the quiz's questions in position order, returns the new
-- attempt_id. Single transaction.
--
-- Validation steps:
--   • Programme exists + PUBLISHED.
--   • Quiz is attached to this programme via the junction.
--   • Quiz exists + PUBLISHED.
--   • max_attempts not exceeded under per-(student, quiz,
--     programme) standalone scope — counts terminal attempts on
--     standalone rows (programme_activity_id IS NULL) for the
--     same (quiz, programme) tuple. Activity-linked attempts
--     have a separate scope (per §9.7-B literal reading + the
--     Option-2 routing the client uses to keep one cap per row).
--   • Quiz has at least one item.
--
-- Snapshot shape mirrors nclex_create_programme_attempt: walks
-- nclex_tutor_quiz_items in position order, writes nclex_attempt_items
-- with item_source='TUTOR' and the question's tutor_id (the
-- nclex_attempt_items_tutor_id_consistent CHECK requires it).

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

  -- 2. Programme exists + PUBLISHED. (Permissive v1 — any STUDENT
  --    can launch a quiz on any PUBLISHED programme; tightens to
  --    enrolment-aware when the enrolment slice lands.)
  SELECT programme_id, status INTO v_programme
  FROM nclex_programmes
  WHERE programme_id = p_programme_id;

  IF v_programme.programme_id IS NULL THEN
    RAISE EXCEPTION 'programme not found';
  END IF;
  IF v_programme.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'programme is not published';
  END IF;

  -- 3. Quiz is attached to this programme via the junction. A row
  --    in nclex_programme_quizzes IS the permission; without it
  --    the student has no place to see / launch this quiz from.
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

  -- 5. §9.7-B cap — per-(student, quiz, programme) terminal
  --    attempts on STANDALONE rows. Activity-linked attempts of
  --    the same quiz are scoped separately (their own per-activity
  --    counter under the existing RPC). The cap match is exact:
  --    only attempts with NULL programme_activity_id count here.
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

  -- 6. Insert attempt header. intent from quiz_kind (MOCK→EXAM,
  --    PRACTICE→STUDY) — same derivation as the activity-linked
  --    RPC. programme_activity_id stays NULL; programme_id + quiz_id
  --    carry the standalone target.
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

  -- 7. Snapshot questions in position order. Mirrors the
  --    activity-linked RPC's snapshot block — same column set,
  --    same classification JSONB shape, same item_source='TUTOR'.
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

  -- 8. Counters.
  UPDATE nclex_attempts
  SET actual_question_count = v_running,
      actual_unit_count     = v_running,
      updated_at            = NOW()
  WHERE attempt_id = v_attempt_id;

  RETURN v_attempt_id;
END;
$$;


-- =========================================================
-- Grants — same shape as the activity-linked RPC.
-- =========================================================
REVOKE EXECUTE ON FUNCTION nclex_create_standalone_quiz_attempt(UUID, UUID)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION nclex_create_standalone_quiz_attempt(UUID, UUID)
  TO authenticated;
