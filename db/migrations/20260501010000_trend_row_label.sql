-- Slice 13 follow-up: editable row-axis label for trend datasets.
-- Currently the data-table's left column is hard-coded to "Metric" in
-- the UI even though every other axis (timepoints, cells, ref-range)
-- is curator-editable. This column lets the curator name the
-- row-axis whatever fits the dataset (e.g. "Lab", "Finding",
-- "Score", "Doctor's note"). NULL falls back to "Metric" at render.
--
-- Additive-only — nullable, no default change. Safe to apply ahead of
-- the matching app-code release.

ALTER TABLE nclex_trend_datasets       ADD COLUMN row_label TEXT;
ALTER TABLE nclex_tutor_trend_datasets ADD COLUMN row_label TEXT;
