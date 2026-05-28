-- =========================================================
-- MyNclex — Slice 11.3a: shelf tagline column
-- File: mynclex/db/migrations/20260617120000_slice_11_3a_shelf_tagline.sql
-- =========================================================
-- Adds `tagline TEXT NULL` to `nclex_tutor_library_shelves`.
--
-- The library planning doc shows the All Shelves carousel header
-- as: colour dot + title + count + tagline (one short sentence).
-- The 11.1 schema only had `description`, intended as the longer
-- copy for the shelf detail page (slice 11.4). 11.3a separates
-- the two so both surfaces have a dedicated field:
--
--   • tagline     — short, carousel-header one-liner
--                   ("Every cohort gets these in Week 1.")
--   • description — longer copy for the shelf detail page
--                   (slice 11.4); free length, plain text
--
-- Both fields are optional. New shelves can ship without either
-- and the UI degrades gracefully (no tagline span, no description
-- block).
--
-- No backfill — every existing shelf row will have NULL tagline,
-- which renders as an empty span in the carousel header.
-- =========================================================


BEGIN;

ALTER TABLE nclex_tutor_library_shelves
  ADD COLUMN tagline TEXT;

COMMIT;
