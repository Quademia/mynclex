-- mynclex/db/migrations/20260518120000_progress_engine_1_foundation.sql
--
-- Progress engine — Slice 1 (foundation).
-- Spec: docs/product-plan/progress-engine.md, settled 2026-05-16.
--
-- Ships:
--   * nclex_student_activity_progress table (§4) — one row per
--     (student, activity) when DONE; same shape for QUIZ_ATTEMPT
--     and MANUAL sources.
--   * nclex_progress_on_attempt_terminal() trigger function (§5.1)
--     that writes a QUIZ_ATTEMPT row when a programme attempt's
--     status flips to COMPLETED or TIMED_OUT (ABANDONED excluded).
--   * Three RLS policies (§5.3) — student own; tutor read for
--     their programmes' students; SUPER_ADMIN bypass.
--
-- Does NOT ship (later slices):
--   * Manual mark/un-mark server actions — Slice 2.
--   * Soft guidance UX helpers (Up next, % done, Where I left off)
--     — Slice 3.
--   * Programme history split — Slice 4.

-- =========================================================
-- Table
-- =========================================================

CREATE TABLE nclex_student_activity_progress (
  progress_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  student_id         UUID NOT NULL
                     REFERENCES nclex_users(id)
                     ON DELETE CASCADE,

  -- Row attaches to the TEMPLATE activity, never to a cohort.
  -- A self-paced student and a cohort student share the same
  -- progress for the same activity. Cohort / programme are
  -- derivable via the activity -> unit -> programme chain.
  activity_id        UUID NOT NULL
                     REFERENCES nclex_programme_activities(activity_id)
                     ON DELETE CASCADE,

  -- Which write path produced this row.
  -- QUIZ_ATTEMPT -> must have attempt_id; vanishes via ON DELETE
  --                 CASCADE if the underlying attempt is hard-voided.
  -- MANUAL       -> attempt_id is NULL; reversible by student via
  --                 the un-mark server action (Slice 2).
  completion_source  TEXT NOT NULL
                     CHECK (completion_source IN ('QUIZ_ATTEMPT', 'MANUAL')),

  -- Populated only when completion_source = 'QUIZ_ATTEMPT'.
  -- For traceability + the void cascade.
  attempt_id         UUID
                     REFERENCES nclex_attempts(attempt_id)
                     ON DELETE CASCADE,

  -- Wall-clock moment the activity first became DONE.
  -- QUIZ_ATTEMPT -> the attempt's ended_at.
  -- MANUAL       -> NOW() at click.
  -- NEVER updated on retake -- DONE is a one-time state transition.
  completed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Who marked the row done. NULL = self-marked by `student_id`
  -- (always true in v1). Reserved for v2 tutor-marked attendance
  -- on ONLINE_LIVE_SESSION; v1 server actions always write NULL.
  marked_by          UUID
                     REFERENCES nclex_users(id)
                     ON DELETE SET NULL,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (student_id, activity_id),

  CONSTRAINT nclex_student_activity_progress_source_consistent CHECK (
    (completion_source = 'QUIZ_ATTEMPT' AND attempt_id IS NOT NULL)
    OR (completion_source = 'MANUAL' AND attempt_id IS NULL)
  )
);

-- Composite covering index for the tutor-analytics hot path
-- ("for activity X, count DONE / list students"). Leading activity_id
-- makes it usable; trailing student_id enables index-only scans.
-- Strictly stronger than a single-column activity_id index for
-- these reads, so we don't create that one.
CREATE INDEX idx_nclex_student_activity_progress_activity_student
  ON nclex_student_activity_progress(activity_id, student_id);

-- Partial index for the void-cascade lookup. Most rows have
-- attempt_id NULL (the 4 MANUAL types), so partial keeps the index
-- tiny.
CREATE INDEX idx_nclex_student_activity_progress_attempt
  ON nclex_student_activity_progress(attempt_id)
  WHERE attempt_id IS NOT NULL;

-- The UNIQUE constraint on (student_id, activity_id) already gives
-- Postgres a student-leading index, so a separate (student_id)
-- index is redundant and not created.


-- =========================================================
-- Trigger — QUIZ_ATTEMPT writeback
-- =========================================================
--
-- Fires when an IN_PROGRESS programme attempt becomes COMPLETED or
-- TIMED_OUT. ABANDONED is excluded per §3. Idempotent via the
-- ON CONFLICT — a second terminal attempt is a no-op (DONE is
-- one-time, §1).
--
-- Runs as the student updating their own attempt, so the INSERT
-- satisfies the student_own RLS WITH CHECK. A future background
-- timeout sweeper, if added, runs as service role and bypasses
-- RLS naturally.

CREATE OR REPLACE FUNCTION nclex_progress_on_attempt_terminal()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IN ('COMPLETED', 'TIMED_OUT')
     AND OLD.status = 'IN_PROGRESS'
     AND NEW.source = 'PROGRAMME_ASSIGNED'
     AND NEW.programme_activity_id IS NOT NULL THEN

    INSERT INTO nclex_student_activity_progress
      (student_id, activity_id, completion_source, attempt_id, completed_at)
    VALUES
      (NEW.student_id,
       NEW.programme_activity_id::UUID,
       'QUIZ_ATTEMPT',
       NEW.attempt_id,
       COALESCE(NEW.ended_at, NOW()))
    ON CONFLICT (student_id, activity_id) DO NOTHING;

  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER nclex_attempts_progress_writeback
  AFTER UPDATE OF status ON nclex_attempts
  FOR EACH ROW
  EXECUTE FUNCTION nclex_progress_on_attempt_terminal();


-- =========================================================
-- RLS
-- =========================================================

ALTER TABLE nclex_student_activity_progress ENABLE ROW LEVEL SECURITY;

-- Students read+write their own progress only.
CREATE POLICY nclex_student_activity_progress_student_own
  ON nclex_student_activity_progress
  FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Tutors read progress for activities in their own programmes.
-- Joins through unit -> programme; same ownership chain used by
-- the rest of the tutor-side curriculum policies.
CREATE POLICY nclex_student_activity_progress_tutor_read
  ON nclex_student_activity_progress
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_activities pa
      JOIN nclex_programme_units pu ON pu.unit_id = pa.unit_id
      JOIN nclex_programmes p ON p.programme_id = pu.programme_id
      WHERE pa.activity_id = nclex_student_activity_progress.activity_id
        AND p.tutor_id = auth.uid()
    )
  );

-- SUPER_ADMIN bypass — matches the intentional v1 pattern on
-- other tutor-side tables (see CLAUDE.md + project memory).
CREATE POLICY nclex_student_activity_progress_superadmin
  ON nclex_student_activity_progress
  FOR ALL TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));
