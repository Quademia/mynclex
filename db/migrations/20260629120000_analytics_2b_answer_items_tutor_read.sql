-- 20260629120000_analytics_2b_answer_items_tutor_read.sql
-- Cohort analytics (Slice 2b) — tutor read access to per-question answers.
--
-- The per-question "re-teach signal" (which questions the class gets wrong)
-- joins nclex_attempt_items (item_id = question identity, stem_snapshot = the
-- text) to nclex_attempt_answers (is_correct). Both are student-private, so a
-- tutor can't see them. This adds tutor read policies scoped — like the
-- attempts policy (20260628120000) — through the attempt's owning programme,
-- covering BOTH attempt shapes (activity-launched and standalone).
--
-- Read-only; students remain the sole writers. The aggregation query narrows
-- to one cohort's quizzes + roster.

BEGIN;

CREATE POLICY nclex_attempt_items_tutor_read
  ON nclex_attempt_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_attempts a
      WHERE a.attempt_id = nclex_attempt_items.attempt_id
        AND (
          (
            a.programme_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM nclex_programmes p
              WHERE p.programme_id = a.programme_id AND p.tutor_id = auth.uid()
            )
          )
          OR
          (
            a.programme_activity_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM nclex_programme_activities pa
              JOIN nclex_programme_units pu ON pu.unit_id = pa.unit_id
              JOIN nclex_programmes p ON p.programme_id = pu.programme_id
              WHERE pa.activity_id = a.programme_activity_id::uuid
                AND p.tutor_id = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY nclex_attempt_answers_tutor_read
  ON nclex_attempt_answers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_attempts a
      WHERE a.attempt_id = nclex_attempt_answers.attempt_id
        AND (
          (
            a.programme_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM nclex_programmes p
              WHERE p.programme_id = a.programme_id AND p.tutor_id = auth.uid()
            )
          )
          OR
          (
            a.programme_activity_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM nclex_programme_activities pa
              JOIN nclex_programme_units pu ON pu.unit_id = pa.unit_id
              JOIN nclex_programmes p ON p.programme_id = pu.programme_id
              WHERE pa.activity_id = a.programme_activity_id::uuid
                AND p.tutor_id = auth.uid()
            )
          )
        )
    )
  );

COMMIT;
