-- 20260626120000_slice_11_12_shelf_activity.sql
-- Slice 11.12 — Shelf as a curriculum activity ("Option C", same model
-- as the Library Note in slice 11.11a; see
-- docs/product-plan/tutor-library.md → 11.11/11.12 recording-model note).
--
-- A Shelf attached to a unit is a FIRST-CLASS activity: it gets a
-- nclex_programme_activities row (new type SHELF) so it inherits
-- ordering / publish / cohort windows / picker-reorder-detach chrome for
-- free — AND it keeps its nclex_tutor_library_note_attachments row for
-- the library-specific detail. For a shelf the attachment carries
-- shelf_id (note_id NULL — enforced by the kind XOR check from slice
-- 11.1) plus the per-placement skipped_note_ids list. The two rows are
-- 1:1, linked by the activity_id column added in slice 11.11a (whose
-- migration already noted it "serves both note and shelf attachments").
--
-- A shelf is ATOMIC: ONE activity row + ONE attachment row, never one
-- activity per member note. Membership is read LIVE (a shelf-membership
-- join at render time), so adding/removing a note in the library updates
-- every attachment. "Hide in this unit" appends a note_id to
-- skipped_note_ids rather than breaking the shelf link.
--
-- Completion stays DERIVED (slice 11.12b): a SHELF activity gets NO
-- nclex_student_activity_progress row. "Done" rolls up from the member
-- notes' nclex_library_note_state.marked_done_at (minus skipped notes).
--
-- This migration is small on purpose: the attachment table already had
-- shelf_id + skipped_note_ids + the note_id XOR shelf_id CHECK since
-- slice 11.1, and the activity_id link since slice 11.11a. All that is
-- left is to allow SHELF as an activity type.

BEGIN;

-- Allow SHELF as an activity type (DROP + re-ADD the CHECK, matching the
-- slice 9.3d-a / 11.11a pattern).
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
    'LIBRARY_NOTE',
    'SHELF'
  ));

COMMIT;
