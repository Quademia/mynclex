-- =========================================================
-- MyNclex — Slice 1.11b: parent_case_id back-pointer
-- File: mynclex/db/migrations/mynclex_parent_case_id_slice_1_11b.sql
-- Depends on: schema.sql (nclex_bank_items, nclex_tutor_questions,
--   nclex_case_studies, nclex_tutor_case_studies all exist).
-- =========================================================
-- Adds parent_case_id to the two question tables so case-linked
-- child questions can be distinguished from standalone questions
-- in the bank list filter. NULL for standalone items, case_id for
-- case-linked items.
--
-- ON DELETE SET NULL is deliberate: if a case is deleted we keep
-- the child questions as orphans rather than cascade-deleting
-- real authored content. They can be re-linked or promoted to
-- standalone later.
--
-- Partial indexes (WHERE parent_case_id IS NOT NULL) keep the
-- index small — most items will have NULL here. The standalone-
-- pool filter (`parent_case_id IS NULL`) is a cheap null-check,
-- not an index scan.
-- =========================================================

-- 1. Admin bank items.
ALTER TABLE nclex_bank_items
  ADD COLUMN parent_case_id TEXT NULL
    REFERENCES nclex_case_studies(case_id) ON DELETE SET NULL;

CREATE INDEX idx_nclex_bank_items_parent_case
  ON nclex_bank_items(parent_case_id)
  WHERE parent_case_id IS NOT NULL;

-- 2. Tutor questions.
ALTER TABLE nclex_tutor_questions
  ADD COLUMN parent_case_id TEXT NULL
    REFERENCES nclex_tutor_case_studies(case_id) ON DELETE SET NULL;

CREATE INDEX idx_nclex_tutor_questions_parent_case
  ON nclex_tutor_questions(parent_case_id)
  WHERE parent_case_id IS NOT NULL;
