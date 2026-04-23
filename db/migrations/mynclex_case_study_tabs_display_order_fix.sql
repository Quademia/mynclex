-- =========================================================
-- MyNclex — Slice 1.11a fix: drop display_order CHECK constraints
-- File: mynclex/db/migrations/mynclex_case_study_tabs_display_order_fix.sql
-- Depends on: mynclex_case_study_tabs_slice_1_11a.sql
-- =========================================================
-- The 1.11a migration added CHECK (display_order >= 0) to both
-- case-study tab tables. This collides with reorderTabsAction's
-- two-pass negate-then-set strategy (temporary negative values
-- during a swap to dodge the UNIQUE (case_id, display_order)
-- constraint). The CHECK was defence-in-depth on an internal
-- ordering field and wasn't protecting anything user-facing.
-- Dropping it lets reorder work as designed.
-- =========================================================

ALTER TABLE nclex_case_study_tabs
  DROP CONSTRAINT nclex_case_study_tabs_display_order_check;

ALTER TABLE nclex_tutor_case_study_tabs
  DROP CONSTRAINT nclex_tutor_case_study_tabs_display_order_check;
