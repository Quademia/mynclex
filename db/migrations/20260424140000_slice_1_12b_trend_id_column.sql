-- =========================================================
-- MyNclex — Slice 1.12b: trend_id FK column on bank items
-- File: mynclex/db/migrations/mynclex_trend_id_column_slice_1_12b.sql
-- Applied: 2026-04-24 (dev — zrakjibtxyzoqcdtvpmq)
-- =========================================================
-- Adds the nullable trend_id column on both question tables:
--   • nclex_bank_items       → nclex_trend_datasets
--   • nclex_tutor_questions  → nclex_tutor_trend_datasets
--
-- ON DELETE RESTRICT prevents bare deletes of a dataset that has
-- attached questions. The 1.12c delete-with-confirmation flow
-- handles the user-facing path (detach-and-delete / delete-everything).
--
-- Partial indexes — only rows where trend_id IS NOT NULL get indexed.
-- 99% of bank items stay NULL; the only read path that follows the
-- FK is the trend editor loading its attached questions. Non-trend
-- items never incur index cost.
--
-- No new RLS policies — existing nclex_bank_items and
-- nclex_tutor_questions policies already cover trend-linked rows
-- (they're still just bank items).

ALTER TABLE nclex_bank_items
  ADD COLUMN IF NOT EXISTS trend_id TEXT
  REFERENCES nclex_trend_datasets(trend_id) ON DELETE RESTRICT;

ALTER TABLE nclex_tutor_questions
  ADD COLUMN IF NOT EXISTS trend_id TEXT
  REFERENCES nclex_tutor_trend_datasets(trend_id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS nclex_bank_items_trend_id_idx
  ON nclex_bank_items(trend_id)
  WHERE trend_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS nclex_tutor_questions_trend_id_idx
  ON nclex_tutor_questions(trend_id)
  WHERE trend_id IS NOT NULL;
