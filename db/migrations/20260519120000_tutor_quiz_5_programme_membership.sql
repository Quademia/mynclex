-- =========================================================
-- MyNclex — Tutor Quiz, Slice 5: Programme-level quiz membership
-- File: mynclex/db/migrations/20260519120000_tutor_quiz_5_programme_membership.sql
-- =========================================================
-- Adds the junction table that records "which quizzes are attached
-- to which programme" and the RLS that scopes it. Source of truth:
--   docs/product-plan/tutor-quiz-system.md §9
--
-- Two write paths feed the junction (both implemented in app code,
-- not enforced here):
--   1. Activity-save auto-mirror — saving an activity with a
--      non-null quiz_id ALSO upserts (programme_id, quiz_id) into
--      this table. The activity-link IS a placement within the
--      programme; the junction records the membership.
--   2. Standalone add — the tutor explicitly attaches a quiz to a
--      programme without making it an activity, from the new
--      /tutor/programme/[id]/quizzes page.
--
-- Either path makes the quiz available standalone via the Slice 6
-- student Quizzes page; the activity-link path additionally
-- surfaces it in the curriculum (existing behaviour, unchanged).
--
-- The "Linked to Unit N" / "Standalone" hint on the tutor row
-- comes from a LEFT JOIN to nclex_programme_activities — there is
-- NO `linked_via_activity_id` column. Whether a quiz is also
-- activity-linked is derived at read time; stays consistent
-- automatically, one fewer write path.
--
-- Remove is BLOCK, not cascade — enforced in the remove server
-- action (§9.3). The DB only has the FK CASCADEs (which fire when
-- the programme or quiz itself is deleted).
--
-- Backfill: none. The junction starts empty for every existing
-- programme. The activity-save auto-mirror only fires on subsequent
-- writes; any quizzes already linked to activities BEFORE this slice
-- shipped do not back-populate. Cheap to re-save if a tutor cares.


-- =========================================================
-- 1. nclex_programme_quizzes
-- =========================================================
-- The canonical record of "what quizzes are in this programme."
-- Composite PK enforces idempotency at the row level — the same
-- (programme, quiz) pair can't appear twice, so both write paths
-- can safely use ON CONFLICT DO NOTHING.

CREATE TABLE nclex_programme_quizzes (
  programme_id  UUID NOT NULL
                REFERENCES nclex_programmes(programme_id) ON DELETE CASCADE,
  quiz_id       UUID NOT NULL
                REFERENCES nclex_tutor_quizzes(quiz_id)   ON DELETE CASCADE,

  -- Default sort key on the tutor page (added_at DESC) and the
  -- student page (Slice 6).
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (programme_id, quiz_id)
);

-- Reverse-lookup index — drives the "Used in N programmes" chip on
-- /tutor/quizzes (one count per quiz_id) and the Slice 6 student
-- read path keyed on quiz_id when chasing membership.
CREATE INDEX idx_nclex_programme_quizzes_quiz
  ON nclex_programme_quizzes(quiz_id);


-- =========================================================
-- 2. RLS — junction
-- =========================================================
-- Tutor own: walks the parent programme's tutor_id (the junction
-- row has no tutor_id of its own — ownership is through the
-- programme). SUPER_ADMIN bypass mirrors the established v1 pattern.
-- Student select: PUBLISHED-parent-only — permissive v1, tightens
-- to enrolment-aware when the enrolment slice lands.

ALTER TABLE nclex_programme_quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_programme_quizzes_tutor_own
  ON nclex_programme_quizzes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_quizzes.programme_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_quizzes.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_programme_quizzes_superadmin
  ON nclex_programme_quizzes FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));

CREATE POLICY nclex_programme_quizzes_student_select
  ON nclex_programme_quizzes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_quizzes.programme_id
        AND p.status = 'PUBLISHED'
    )
  );


-- =========================================================
-- 3. RLS — new student-read policy on nclex_tutor_quizzes
-- =========================================================
-- The Slice 6 student Quizzes page reads quiz metadata (title,
-- kind, mode, pass_score, max_attempts) directly from
-- nclex_tutor_quizzes. The existing policies on that table only
-- allow the owning tutor or a SUPER_ADMIN — students would be
-- blocked. This new SELECT policy makes a quiz readable when:
--   • the quiz itself is PUBLISHED, AND
--   • it is attached (via the junction) to a programme that is
--     itself PUBLISHED.
-- Permissive v1; tightens to enrolment-aware in the enrolment slice
-- by joining through the (future) enrolments table on top of the
-- PUBLISHED gate.

CREATE POLICY nclex_tutor_quizzes_student_select
  ON nclex_tutor_quizzes FOR SELECT
  TO authenticated
  USING (
    status = 'PUBLISHED'
    AND EXISTS (
      SELECT 1
      FROM nclex_programme_quizzes pq
      JOIN nclex_programmes p ON p.programme_id = pq.programme_id
      WHERE pq.quiz_id = nclex_tutor_quizzes.quiz_id
        AND p.status = 'PUBLISHED'
    )
  );
