-- =========================================================
-- MyNclex — Slice 3c: public detail views (units + cohorts)
-- File: mynclex/db/migrations/20260529120000_slice_3c_public_detail_views.sql
-- =========================================================
-- Extends the shared public-projection layer (Slice 3b) by ADDITION —
-- two more nclex_public_* views feeding the read-only programme detail
-- page. Same rule as nclex_public_programmes: visible only for a
-- PUBLISHED programme whose tutor is active, owner-rights so anon gets
-- the curated slice without the base tables' RLS opening up.
--
--   nclex_public_units   — published units of a public programme
--                          (index + title + description). Draft units
--                          stay hidden (no leaking unfinished
--                          curriculum). Feeds the "Syllabus" section.
--   nclex_public_cohorts — non-cancelled cohorts of a public programme
--                          (name + dates + late-join flag). Feeds the
--                          "Available cohorts" section. Derived status
--                          (Upcoming / In progress) is computed in TS.

BEGIN;

CREATE OR REPLACE VIEW nclex_public_units AS
SELECT
  pu.programme_id,
  pu.unit_index,
  pu.title,
  pu.description
FROM nclex_programme_units pu
JOIN nclex_programmes p ON p.programme_id = pu.programme_id
JOIN nclex_users u      ON u.id = p.tutor_id
WHERE p.status = 'PUBLISHED'
  AND u.is_active
  AND pu.is_published;

GRANT SELECT ON nclex_public_units TO anon, authenticated;

CREATE OR REPLACE VIEW nclex_public_cohorts AS
SELECT
  c.cohort_id,
  c.programme_id,
  c.name,
  c.start_date,
  c.end_date,
  c.allow_late_join
FROM nclex_cohorts c
JOIN nclex_programmes p ON p.programme_id = c.programme_id
JOIN nclex_users u      ON u.id = p.tutor_id
WHERE p.status = 'PUBLISHED'
  AND u.is_active
  AND c.cancelled_at IS NULL;

GRANT SELECT ON nclex_public_cohorts TO anon, authenticated;

COMMIT;
