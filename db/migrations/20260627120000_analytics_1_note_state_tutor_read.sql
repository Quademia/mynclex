-- 20260627120000_analytics_1_note_state_tutor_read.sql
-- Cohort analytics (Slice 1) — tutor read access to library-note completion.
--
-- Completion for the LIBRARY_NOTE and SHELF activity types is DERIVED from
-- nclex_library_note_state.marked_done_at (per student, per note) — not the
-- progress engine. That table is student-private (self-only RLS), so a tutor
-- could not see whether their cohort had completed library-note / shelf
-- activities. The cohort completion dashboard needs that visibility for all
-- 8 activity types.
--
-- This adds a tutor read policy mirroring the progress engine's
-- nclex_student_activity_progress_tutor_read: a tutor may SELECT note-state
-- rows for notes they OWN. Ownership is the scope — and because a student
-- only ever has a note_state row for a note they can see (RLS-gated to the
-- tutor's published, enrolled programme), this only ever exposes the tutor's
-- own enrolled students. The analytics query further narrows to one cohort's
-- roster. Read-only; no INSERT/UPDATE/DELETE for tutors (students remain the
-- sole writers of their own state).
--
-- Covers SHELF too: a shelf's completion rolls up from its member notes'
-- states, and shelf members are the tutor's own notes — same ownership scope.

BEGIN;

CREATE POLICY nclex_library_note_state_tutor_read
  ON nclex_library_note_state FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nclex_tutor_library_notes n
      WHERE n.note_id = nclex_library_note_state.note_id
        AND n.tutor_id = auth.uid()
    )
  );

COMMIT;
