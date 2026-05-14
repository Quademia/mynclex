-- =========================================================
-- MyNclex — Slice 9.3d-a: Activity description + session rename
-- File: mynclex/db/migrations/20260512400000_slice_9_3d_a_
--         activity_description_and_online_rename.sql
-- =========================================================
-- Two schema changes shipped alongside the slice's editor work
-- (External link + Online live session bodies, plus the picker
-- enable). Both kept in one migration so the editor depends on
-- a single apply-step.
--
-- 1. Adds nclex_programme_activities.description column
--    (nullable text). Symmetric with units + blocks which both
--    already carry a description. The activity-modal shell now
--    surfaces it between Title and Note — "what the activity
--    is about" (substantive) vs. note's "directive to the
--    student" (operational). Distinct semantic columns rather
--    than overloading one.
--
-- 2. Renames the LIVE_SESSION activity type to
--    ONLINE_LIVE_SESSION. "Live" describes synchronicity
--    (real-time), not medium. A future IN_PERSON_LIVE_SESSION
--    will also be live, so the original name conflated two
--    independent axes. Both renamed-pair names carry "LIVE" to
--    leave room for a future RECORDED_SESSION (async) type.
--
--    Zero data to migrate — no LIVE_SESSION rows have ever been
--    inserted (the picker had it disabled from 9.3a through
--    9.3c). The rename is a CHECK constraint swap, nothing else.
--
-- No RLS changes — existing policies cover all columns of the
-- table by predicate (no per-column policies).

-- ---------- description column ----------

ALTER TABLE nclex_programme_activities
  ADD COLUMN description TEXT;


-- ---------- type rename ----------

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
    'PRACTICE_QUIZ'
  ));
