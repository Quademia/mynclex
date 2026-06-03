-- 20260628120000_analytics_2_attempts_tutor_read.sql
-- Cohort analytics (Slice 2) — tutor read access to student quiz attempts.
--
-- Quiz performance (pass rate, class average, per-student scores) reads
-- nclex_attempts.final_score / pass_score for PROGRAMME_ASSIGNED attempts.
-- That table is student-private (self_read + admin_all only), so a tutor
-- could not see how their cohort performed. This adds a tutor read policy
-- scoped by programme ownership, mirroring the progress-engine /
-- note-state tutor_read pattern.
--
-- Scope: an attempt is readable by the tutor who owns the programme the
-- attempt belongs to. programme_id is a real uuid column on the attempt
-- (set on programme/cohort launch), so the check is a direct ownership
-- lookup — no TEXT cast. Bank attempts (programme_id NULL) stay private.
-- Read-only; students remain the sole writers of their own attempts. The
-- analytics query narrows further to one cohort's roster.

BEGIN;

CREATE POLICY nclex_attempts_tutor_read
  ON nclex_attempts FOR SELECT
  TO authenticated
  USING (
    programme_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM nclex_programmes p
      WHERE p.programme_id = nclex_attempts.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

COMMIT;
