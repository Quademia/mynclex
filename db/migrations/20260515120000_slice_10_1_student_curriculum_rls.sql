-- =========================================================
-- MyNclex — Slice 10.1: Student curriculum viewer scaffold
-- File: mynclex/db/migrations/20260515120000_slice_10_1_student_curriculum_rls.sql
-- =========================================================
-- Opens the student-side of the curriculum tree. The tutor side has
-- shipped programme authoring + cohort curation; the next layer is
-- the student-facing viewer. RLS currently locks every curriculum
-- table to the owning tutor (and SUPER_ADMIN) — a signed-in student
-- can read nothing. This migration adds a SELECT policy per table
-- that exposes PUBLISHED content to any authenticated user.
--
-- Permissive shape (v1 only):
--   "any authenticated user can SELECT rows under a PUBLISHED
--    programme."
--
-- This is intentionally broader than the final enrolment-aware
-- shape. The matching TS access helpers (lib/access/student/
-- require-{programme,cohort}-access.ts) are also permissive in
-- this slice. Both layers tighten to "user has an active
-- enrolment record" when the enrolment slice ships — RLS swaps the
-- USING clause to an EXISTS on the enrolment table, and the TS
-- helpers swap their permissive checks for the same.
--
-- Scope (one SELECT policy per table, all named `*_student_select`):
--   - nclex_programmes               status = 'PUBLISHED'
--   - nclex_programme_units          parent programme PUBLISHED
--   - nclex_programme_blocks         parent unit's programme PUBLISHED
--   - nclex_programme_activities     parent unit's programme PUBLISHED
--   - nclex_cohorts                  parent programme PUBLISHED
--   - nclex_cohort_checklist_items   cohort's parent programme PUBLISHED
--
-- WHY gate at programme-level status rather than per-row publish:
--   Per-row `is_published` on unit / block / activity stays as the
--   TS-layer render filter (isVisibleToStudents() in
--   lib/curriculum/format.ts). RLS guards the hard wall (DRAFT or
--   ARCHIVED programmes never leak); TS handles granular
--   curatorial control. Two layers, two responsibilities. If a unit
--   gets toggled to draft after publish, RLS still lets a student
--   read the row, but the TS predicate filters it out at render —
--   safe in both directions.
--
-- WHY 'PUBLISHED' only (not 'PUBLISHED' OR 'ARCHIVED'):
--   Matches the TS predicate: programmeStatus !== 'PUBLISHED' →
--   not visible. ARCHIVED is for "stop selling to new students";
--   the "keep already-enrolled students reading" story lands with
--   the enrolment slice, where the policy USING clause will check
--   enrolment record presence regardless of current status.
--
-- No new columns, no triggers, no functions — pure RLS.

BEGIN;


-- =========================================================
-- nclex_programmes
-- =========================================================

CREATE POLICY nclex_programmes_student_select
  ON nclex_programmes FOR SELECT
  TO authenticated
  USING (status = 'PUBLISHED');


-- =========================================================
-- nclex_programme_units
-- =========================================================
-- Parent programme must be PUBLISHED. Unit's own `is_published`
-- is NOT checked here — that's a TS render filter (see header).

CREATE POLICY nclex_programme_units_student_select
  ON nclex_programme_units FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_programme_units.programme_id
        AND p.status = 'PUBLISHED'
    )
  );


-- =========================================================
-- nclex_programme_blocks
-- =========================================================
-- Block → unit → programme. Two-hop EXISTS via the unit FK.

CREATE POLICY nclex_programme_blocks_student_select
  ON nclex_programme_blocks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_blocks.unit_id
        AND p.status = 'PUBLISHED'
    )
  );


-- =========================================================
-- nclex_programme_activities
-- =========================================================
-- Activity → unit → programme. Mirrors the block chain. Activities
-- validate via unit_id (loose activities still carry a unit), so
-- the policy chain is uniform with the block policy above.

CREATE POLICY nclex_programme_activities_student_select
  ON nclex_programme_activities FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_programme_units u
      JOIN nclex_programmes p ON p.programme_id = u.programme_id
      WHERE u.unit_id = nclex_programme_activities.unit_id
        AND p.status = 'PUBLISHED'
    )
  );


-- =========================================================
-- nclex_cohorts
-- =========================================================
-- Cohort → parent programme. Single-hop EXISTS. The cohort row
-- itself has no published/draft flag — visibility tracks the
-- programme.

CREATE POLICY nclex_cohorts_student_select
  ON nclex_cohorts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_cohorts.programme_id
        AND p.status = 'PUBLISHED'
    )
  );


-- =========================================================
-- nclex_cohort_checklist_items
-- =========================================================
-- Checklist row → cohort → parent programme. Two-hop EXISTS.
-- Mirrors the tutor-side policy structure (slice 9.3f) but with
-- the ownership predicate replaced by the published-status gate.
-- `is_included` and `release_date` stay as TS render filters
-- (isVisibleToStudents() handles both) — RLS is the hard wall.

CREATE POLICY nclex_cohort_checklist_items_student_select
  ON nclex_cohort_checklist_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_checklist_items.cohort_id
        AND p.status = 'PUBLISHED'
    )
  );


COMMIT;
