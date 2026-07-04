-- =========================================================
-- MyNclex — Drop the legacy case-level classification columns
-- File: mynclex/db/migrations/20260719120000_drop_case_classification_columns.sql
-- =========================================================
-- Wrapper-v2 relegated classification to the CHILD questions ("none on
-- the wrapper" — decision 9.2); the case editor never wrote these
-- columns, and as of 20260717120000 the builder derives a case's match
-- from its children, so nothing reads them anymore. Dropping them
-- removes the trap that caused the eligibility bug in the first place
-- (a future reader wiring something to always-NULL columns).
--
-- `tags` deliberately survives on both tables — wrapper tags are a real
-- feature (case-tag inheritance in the builder, list search, workflow
-- labels like for_prod).
--
-- Nothing else references these columns: verified against the live dev
-- schema (no view / function / snapshot table) and the app layer
-- (loader, types, list-page search blobs updated in the same release).

ALTER TABLE nclex_case_studies
  DROP COLUMN IF EXISTS client_needs_category,
  DROP COLUMN IF EXISTS client_needs_subcategory,
  DROP COLUMN IF EXISTS nursing_subject,
  DROP COLUMN IF EXISTS body_system,
  DROP COLUMN IF EXISTS topic,
  DROP COLUMN IF EXISTS subtopic,
  DROP COLUMN IF EXISTS difficulty;

ALTER TABLE nclex_tutor_case_studies
  DROP COLUMN IF EXISTS client_needs_category,
  DROP COLUMN IF EXISTS client_needs_subcategory,
  DROP COLUMN IF EXISTS nursing_subject,
  DROP COLUMN IF EXISTS body_system,
  DROP COLUMN IF EXISTS topic,
  DROP COLUMN IF EXISTS subtopic,
  DROP COLUMN IF EXISTS difficulty;
