-- =========================================================
-- MyNclex — Tutor Quiz, Slice 3: Student launch
-- File: mynclex/db/migrations/20260517120000_tutor_quiz_3_student_launch.sql
-- =========================================================
-- Closes the Mock/Practice loop: the student-facing surface that
-- creates a PROGRAMME_ASSIGNED attempt from a linked quiz and hands
-- the student off to the existing runner.
--
-- Two pieces:
--   1. New nullable column nclex_attempts.pass_score — the threshold
--      this attempt is graded against. General-purpose (not
--      programme-specific): bank Builder + future Readiness Packs can
--      populate it later when those flows want a pass mark. The
--      runner reads it in review mode to render a Pass/Fail badge
--      alongside the score pill. NULL = ungraded (no badge).
--
--   2. New RPC nclex_create_programme_attempt(programme_activity_id)
--      — fixed-list snapshot, mirroring nclex_create_attempt's
--      snapshot machinery but driven by the quiz's hand-picked
--      ordered question list instead of a shuffled eligibility pool.
--
-- Source of truth for shape + semantics:
--   docs/product-plan/tutor-quiz-system.md §4 (attempt creation)
--   docs/product-plan/tutor-quiz-system.md §5 (modal viewer)
--   docs/product-plan/tutor-quiz-system.md §6 (pass mark + attempt
--                                              limit)
--
-- Decisions confirmed in the slice planning conversation
-- (2026-05-17):
--   • pass_score is general (not programme-only). Same scale as
--     final_score (0..1 fraction), so the runner's pass/fail is
--     `final_score >= pass_score`. NULL = ungraded.
--   • Resume governs in-flight attempts; max_attempts governs
--     terminal ones — two independent rules, no overlap. Terminal
--     statuses (COMPLETED + TIMED_OUT + ABANDONED) count toward
--     max_attempts; IN_PROGRESS does not. The launch modal surfaces
--     an IN_PROGRESS attempt as Resume instead of Start.
--   • Cohort-window validation is NOT replayed in the RPC. The
--     student-side curriculum view already gates LOCKED/CLOSED
--     activities so the launch UI is unreachable for them; the RPC
--     does the lightweight checks (activity exists, is_published,
--     quiz_id non-null, quiz PUBLISHED, max_attempts).


-- =========================================================
-- 1. nclex_attempts.pass_score
-- =========================================================
-- 0..1 fraction. Same scale as final_score so pass/fail is a clean
-- `final_score >= pass_score` comparison; the runner appends "·
-- Pass" or "· Fail" to the review-mode score pill when this is set.
-- NULL = ungraded (the runner renders just "Score · NN%").
--
-- Populated by the new nclex_create_programme_attempt from the
-- quiz's pass_score. Bank attempts (CUSTOM_BUILT) and future
-- Readiness Pack attempts can populate it later — the column is
-- nullable and ungraded is a valid state for any source.

ALTER TABLE nclex_attempts
  ADD COLUMN pass_score NUMERIC
    CHECK (pass_score IS NULL OR (pass_score >= 0 AND pass_score <= 1));


-- =========================================================
-- 2. nclex_create_programme_attempt
-- =========================================================
-- Student clicks Start in the launch modal. Validates, snapshots the
-- quiz's questions in position order, returns the new attempt_id.
-- Single transaction.
--
-- Unlike nclex_create_attempt (pool selection with drift), this is a
-- FIXED-LIST snapshot — the tutor already chose the questions, so
-- there is no eligibility filtering, no shuffle, no drift band.
-- Reuses the existing nclex_attempt_items snapshot column set; the
-- only structural difference is item_source = 'TUTOR' and
-- selection_unit_type = 'QUESTION' (cases / trends excluded from v1
-- quizzes per planning §2).

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

  -- 2. Read activity. SECURITY DEFINER bypasses RLS, so we read on
  --    the activity's columns directly and gate on type +
  --    is_published ourselves. A nonexistent or wrong-type row is a
  --    generic error — never leak which it was.
  SELECT activity_id, type, is_published, payload
    INTO v_activity
  FROM nclex_programme_activities
  WHERE activity_id = p_programme_activity_id;

  IF v_activity.activity_id IS NULL THEN
    RAISE EXCEPTION 'activity not found';
  END IF;
  IF v_activity.type NOT IN ('MOCK', 'PRACTICE_QUIZ') THEN
    RAISE EXCEPTION 'activity is not a quiz';
  END IF;
  IF v_activity.is_published IS NOT TRUE THEN
    RAISE EXCEPTION 'activity is not published';
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
  --    that — the client surfaces the in-progress one before
  --    reaching this RPC). Per planning conversation: terminal =
  --    COMPLETED + TIMED_OUT + ABANDONED.
  IF v_quiz.max_attempts IS NOT NULL THEN
    -- programme_activity_id is TEXT on nclex_attempts (forward-
    -- referenced as TEXT in slice 2.1 before the activities table
    -- existed). Explicit cast: UUID → TEXT.
    SELECT COUNT(*)::INTEGER INTO v_taken
    FROM nclex_attempts
    WHERE student_id = v_student
      AND programme_activity_id = p_programme_activity_id::TEXT
      AND status IN ('COMPLETED', 'TIMED_OUT', 'ABANDONED');
    IF v_taken >= v_quiz.max_attempts THEN
      RAISE EXCEPTION 'no attempts remaining for this quiz';
    END IF;
  END IF;

  -- 6. Insert the attempt header. intent is derived from quiz_kind
  --    (MOCK → EXAM, PRACTICE → STUDY) — one source of truth, no
  --    stored intent on the quiz. duration_seconds and pass_score
  --    are passed through from the quiz as-is; the duration trigger
  --    (slice 4.5b) no-ops because we set duration explicitly when
  --    the quiz has one.
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
    -- requested = the quiz's question count (counted below as the
    -- snapshot proceeds; v_running ends at the actual count).
    (SELECT COUNT(*)::INTEGER FROM nclex_tutor_quiz_items WHERE quiz_id = v_quiz_id),
    0,
    0
  )
  RETURNING attempt_id INTO v_attempt_id;

  -- 7. Snapshot the quiz's questions in position order. Walks
  --    nclex_tutor_quiz_items → nclex_tutor_questions; writes
  --    nclex_attempt_items rows mirroring the bank-side
  --    snapshot columns (stem, instruction, rationale, marks,
  --    classification, content/correct JSON). item_source = 'TUTOR'
  --    on every row.
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
    -- nclex_attempt_items_tutor_id_consistent: when item_source =
    -- 'TUTOR', tutor_id must be set (and NULL when source = 'BANK').
    -- Carry the question's owner through to the snapshot row.
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
      '{}'::jsonb  -- option order: deferred to runner shuffle (mirrors bank RPC)
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


-- =========================================================
-- Grants — restrict to authenticated, same shape as
-- nclex_create_attempt (slice 2.2a).
-- =========================================================
REVOKE EXECUTE ON FUNCTION nclex_create_programme_attempt(UUID)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION nclex_create_programme_attempt(UUID)
  TO authenticated;
