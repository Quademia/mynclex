-- =========================================================
-- MyNclex — Live sessions: attendance → derived completion (Slice 3)
-- File: mynclex/db/migrations/20260704120000_live_session_attendance.sql
-- =========================================================
-- A live session was pulled OUT of progress in Slice 1a because the only
-- v1 signal (student self-report) isn't verifiable. This slice adds a
-- TRUSTWORTHY signal — tutor-marked attendance — so live sessions re-enter
-- the progress picture under the governing rule: "only VERIFIED completion
-- counts." Marking a student PRESENT derives an ATTENDANCE completion row,
-- exactly the way a submitted quiz attempt derives a QUIZ_ATTEMPT row. The
-- student can never self-mark a live session, so completion can ONLY come
-- from the tutor.
--
-- Three marking states (Excused removed from the % denominator; see the
-- analytics/server layer for the denominator rule):
--   PRESENT → derives a completion row
--   ABSENT  → a real "missed it" signal; no completion row
--   EXCUSED → never penalised; no completion row
--
-- See docs/product-plan/live-session-planner.md.


-- =========================================================
-- 1. Widen the progress completion sources to include ATTENDANCE
-- =========================================================
-- The progress table shipped with marked_by + attempt_id already present
-- (built in anticipation — progress-engine.md). The only blockers are the
-- two CHECK constraints, which today allow QUIZ_ATTEMPT / MANUAL only. An
-- ATTENDANCE row has NO attempt (like MANUAL) but IS tutor-marked, so it
-- carries marked_by.

ALTER TABLE nclex_student_activity_progress
  DROP CONSTRAINT nclex_student_activity_progress_completion_source_check;
ALTER TABLE nclex_student_activity_progress
  ADD CONSTRAINT nclex_student_activity_progress_completion_source_check
  CHECK (completion_source IN ('QUIZ_ATTEMPT', 'MANUAL', 'ATTENDANCE'));

ALTER TABLE nclex_student_activity_progress
  DROP CONSTRAINT nclex_student_activity_progress_source_consistent;
ALTER TABLE nclex_student_activity_progress
  ADD CONSTRAINT nclex_student_activity_progress_source_consistent CHECK (
    (completion_source = 'QUIZ_ATTEMPT' AND attempt_id IS NOT NULL)
    OR (completion_source IN ('MANUAL', 'ATTENDANCE') AND attempt_id IS NULL)
  );


-- =========================================================
-- 2. Attendance register — nclex_cohort_session_attendance
-- =========================================================
-- One row per (planner session, student). Hangs off the per-cohort
-- planner row (nclex_cohort_live_sessions), NOT the template marker — a
-- register is per-run. The derived progress row (below) bridges back to
-- the shared marker activity via the planner's marker_activity_id.

CREATE TABLE nclex_cohort_session_attendance (
  attendance_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The per-cohort scheduled session this register belongs to. CASCADE
  -- so clearing a schedule / deleting a cohort cleans up its register.
  session_id      UUID NOT NULL
                  REFERENCES nclex_cohort_live_sessions(session_id)
                  ON DELETE CASCADE,

  -- The marked student.
  student_id      UUID NOT NULL
                  REFERENCES nclex_users(id)
                  ON DELETE CASCADE,

  -- PRESENT derives completion; ABSENT / EXCUSED do not (EXCUSED is also
  -- dropped from the % denominator at read time).
  status          TEXT NOT NULL
                  CHECK (status IN ('PRESENT', 'ABSENT', 'EXCUSED')),

  -- The tutor who marked it (point-of-truth for "only verified counts").
  marked_by       UUID
                  REFERENCES nclex_users(id)
                  ON DELETE SET NULL,
  marked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One register entry per (session, student).
  UNIQUE (session_id, student_id)
);

CREATE INDEX idx_nclex_cohort_session_attendance_session
  ON nclex_cohort_session_attendance(session_id);
CREATE INDEX idx_nclex_cohort_session_attendance_student
  ON nclex_cohort_session_attendance(student_id);

-- updated_at is stamped from the application layer on UPDATE — same
-- pattern as nclex_cohort_live_sessions and every other nclex_* table.


-- =========================================================
-- 3. RLS
-- =========================================================
-- Tutor: full CRUD on registers for sessions in their own programmes
-- (chain attendance -> session -> cohort -> programme -> tutor; mirrors
-- nclex_cohort_live_sessions). Student: read OWN rows only (the student
-- Sessions page shows a student their own attendance record). SUPER_ADMIN
-- bypass per the intentional v1 pattern.

ALTER TABLE nclex_cohort_session_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_cohort_session_attendance_tutor_all
  ON nclex_cohort_session_attendance FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_cohort_live_sessions s
      JOIN nclex_cohorts c ON c.cohort_id = s.cohort_id
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE s.session_id = nclex_cohort_session_attendance.session_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nclex_cohort_live_sessions s
      JOIN nclex_cohorts c ON c.cohort_id = s.cohort_id
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE s.session_id = nclex_cohort_session_attendance.session_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_session_attendance_student_select
  ON nclex_cohort_session_attendance FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY nclex_cohort_session_attendance_admin_all
  ON nclex_cohort_session_attendance FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- 4. Derived completion — attendance → progress row
-- =========================================================
-- Mirror of nclex_progress_on_attempt_terminal() for quizzes. Marking a
-- student PRESENT writes (or keeps) an ATTENDANCE progress row for that
-- student + the session's MARKER activity; ABSENT / EXCUSED / DELETE
-- removes any derived row.
--
-- SECURITY DEFINER is REQUIRED here (unlike the quiz trigger, which runs
-- as the student writing their own attempt). Here the TUTOR's session
-- writes a row for the STUDENT, so the student_own RLS WITH CHECK
-- (student_id = auth.uid()) would reject it. The function is safe to
-- elevate: it only fires from attendance writes, which are themselves
-- RLS-gated to the owning tutor.
--
-- Idempotent: ON CONFLICT DO NOTHING — re-marking PRESENT is a no-op
-- (DONE is one-time). The progress UNIQUE is (student, activity); the
-- activity is the shared TEMPLATE marker, so the rare "same student in
-- two cohorts of the same programme" case shares one progress row — the
-- same template-keyed edge the progress engine already carries.

CREATE OR REPLACE FUNCTION nclex_progress_on_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_marker UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT marker_activity_id INTO v_marker
      FROM nclex_cohort_live_sessions
      WHERE session_id = OLD.session_id;
    IF v_marker IS NOT NULL THEN
      DELETE FROM nclex_student_activity_progress
        WHERE student_id = OLD.student_id
          AND activity_id = v_marker
          AND completion_source = 'ATTENDANCE';
    END IF;
    RETURN OLD;
  END IF;

  -- INSERT or UPDATE
  SELECT marker_activity_id INTO v_marker
    FROM nclex_cohort_live_sessions
    WHERE session_id = NEW.session_id;
  IF v_marker IS NULL THEN
    RETURN NEW;  -- session vanished mid-write; nothing to derive
  END IF;

  IF NEW.status = 'PRESENT' THEN
    INSERT INTO nclex_student_activity_progress
      (student_id, activity_id, completion_source, attempt_id, completed_at, marked_by)
    VALUES
      (NEW.student_id, v_marker, 'ATTENDANCE', NULL,
       COALESCE(NEW.marked_at, now()), NEW.marked_by)
    ON CONFLICT (student_id, activity_id) DO NOTHING;
  ELSE
    -- ABSENT / EXCUSED — clear any derived completion.
    DELETE FROM nclex_student_activity_progress
      WHERE student_id = NEW.student_id
        AND activity_id = v_marker
        AND completion_source = 'ATTENDANCE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER nclex_attendance_progress_writeback
  AFTER INSERT OR UPDATE OR DELETE ON nclex_cohort_session_attendance
  FOR EACH ROW
  EXECUTE FUNCTION nclex_progress_on_attendance();
