-- Slice 13 (decision 16): add is_free_sample + is_builder_visible
-- columns to both trend dataset tables so the trend wrapper-v2 can
-- carry the same three-row Visibility section as the case-study
-- wrapper. Defaults match nclex_bank_items: FALSE / TRUE.
--
-- Pure additive — no rename, no drop, no policy tightening. Honours
-- the additive-only release rule. Existing dataset rows pick up the
-- defaults via the NOT NULL DEFAULT clause; no backfill needed.
--
-- Applied to dev via MCP on 2026-05-01.
-- Will auto-apply to prod when this lands on the prod branch via
-- the migrate-prod.yml GHA.

ALTER TABLE nclex_trend_datasets
  ADD COLUMN IF NOT EXISTS is_free_sample     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_builder_visible BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE nclex_tutor_trend_datasets
  ADD COLUMN IF NOT EXISTS is_free_sample     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_builder_visible BOOLEAN NOT NULL DEFAULT TRUE;
