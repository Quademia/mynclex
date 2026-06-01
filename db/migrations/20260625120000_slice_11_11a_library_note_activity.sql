-- 20260625120000_slice_11_11a_library_note_activity.sql
-- Slice 11.11a — Library Note as a curriculum activity ("Option C",
-- decided 2026-06-01; see docs/product-plan/tutor-library.md → 11.11
-- recording-model note).
--
-- A Library Note attached to a unit is a FIRST-CLASS activity: it gets a
-- nclex_programme_activities row (new type LIBRARY_NOTE) so it inherits
-- ordering / publish / cohort windows / picker-reorder-detach chrome for
-- free — AND it keeps its nclex_tutor_library_note_attachments row for
-- the library-specific detail (note_id / shelf_id, skipped_note_ids, the
-- ON DELETE RESTRICT delete-protection FK). The two rows are 1:1, linked
-- by a new activity_id column on the attachment.
--
-- Completion stays DERIVED: a LIBRARY_NOTE activity gets NO
-- nclex_student_activity_progress row. "Done" lives once in
-- nclex_library_note_state.marked_done_at; the unit-progress query
-- special-cases this type and reads the derived done (slice 11.11b).
--
-- SHELF (the 8th type) lands with slice 11.12; the activity_id link
-- column added here already serves both note and shelf attachments.

BEGIN;

-- 1. Allow LIBRARY_NOTE as an activity type (DROP + re-ADD the CHECK,
--    matching slice 9.3d-a's pattern).
ALTER TABLE nclex_programme_activities
  DROP CONSTRAINT nclex_programme_activities_type_check;

ALTER TABLE nclex_programme_activities
  ADD CONSTRAINT nclex_programme_activities_type_check
  CHECK (type IN (
    'TEXT',
    'PDF',
    'EXTERNAL_LINK',
    'ONLINE_LIVE_SESSION',
    'MOCK',
    'PRACTICE_QUIZ',
    'LIBRARY_NOTE'
  ));

-- 2. Link each attachment row to its activity row (Option C, 1:1).
--    ON DELETE CASCADE: detaching = deleting the activity row, which
--    removes the matching attachment automatically. The attachment's
--    own note_id / shelf_id stay ON DELETE RESTRICT (from slice 11.1) so
--    a note/shelf can't be deleted while attached.
--    NOT NULL: every attachment now belongs to an activity. The table is
--    empty (no attachments shipped before this slice), so no backfill.
ALTER TABLE nclex_tutor_library_note_attachments
  ADD COLUMN activity_id UUID NOT NULL
    REFERENCES nclex_programme_activities(activity_id) ON DELETE CASCADE;

-- One attachment per activity.
CREATE UNIQUE INDEX idx_nclex_tutor_library_note_attachments_activity
  ON nclex_tutor_library_note_attachments(activity_id);

COMMIT;
