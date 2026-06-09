-- 20260628120000_analytics_2_attempts_tutor_read.sql
-- Cohort analytics (Slice 2) — tutor read access to student quiz attempts.
--
-- Quiz performance reads nclex_attempts.final_score / pass_score for
-- PROGRAMME_ASSIGNED attempts. That table is student-private (self_read +
-- admin_all only), so a tutor could not see how their cohort performed.
-- This adds a tutor read policy scoped by programme ownership, mirroring the
-- progress-engine / note-state tutor_read pattern.
--
-- PROGRAMME_ASSIGNED attempts come in TWO shapes (nclex_attempts_source_refs):
--   • activity-launched — programme_activity_id set; programme_id/quiz_id NULL
--   • standalone        — programme_id + quiz_id set; programme_activity_id NULL
-- The policy must cover BOTH, or the common activity-launched attempts stay
-- invisible. Ownership is resolved directly via programme_id for standalone,
-- and by walking activity → unit → programme for activity-launched. Bank
-- attempts (both ref groups NULL) stay private. Read-only; students remain
-- the sole writers of their own attempts.

BEGIN;

CREATE POLICY nclex_attempts_tutor_read
  ON nclex_attempts FOR SELECT
  TO authenticated
  USING (
    -- standalone programme attempts
    (
      programme_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM nclex_programmes p
        WHERE p.programme_id = nclex_attempts.programme_id
          AND p.tutor_id = auth.uid()
      )
    )
    OR
    -- activity-launched programme attempts (walk to the owning programme)
    (
      programme_activity_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM nclex_programme_activities pa
        JOIN nclex_programme_units pu ON pu.unit_id = pa.unit_id
        JOIN nclex_programmes p ON p.programme_id = pu.programme_id
        WHERE pa.activity_id = nclex_attempts.programme_activity_id::uuid
          AND p.tutor_id = auth.uid()
      )
    )
  );

COMMIT;
