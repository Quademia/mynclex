-- =========================================================
-- MyNclex — Dev seed: trend datasets (Slice 1.12a)
-- File: mynclex/db/seed-trends-dev.sql
-- =========================================================
-- One admin-side demo dataset (post-op vitals, Example 1 from
-- mockups/trend-visualisation.html). Three timepoints, five rows,
-- flags + ref-range populated on at least one row so every
-- authoring affordance renders during dev testing.
--
-- No attached questions — those ship in Slice 1.12b.
-- is_published = FALSE so the seed only surfaces for curators.
-- =========================================================

INSERT INTO nclex_trend_datasets (
  trend_id,
  title,
  scenario,
  kind,
  timepoints,
  rows,
  is_published
) VALUES (
  'NCLEX_TRD_00001',
  'Post-op vitals — 58F, abdominal surgery day 1',
  '58-year-old female, post-op day 1 following abdominal surgery. Vitals monitored hourly. Use this dataset with Matrix / SATA / Cloze / Highlight response types to test pattern recognition.',
  'vitals',
  '["0800", "0900", "1000"]'::jsonb,
  '[
    {
      "metric":    "BP",
      "values":    ["118/72", "104/64", "88/52"],
      "flags":     [null, null, "abnormal"],
      "ref_range": "90/60 – 140/90"
    },
    {
      "metric":    "HR",
      "values":    ["84", "98", "124"],
      "flags":     [null, null, "abnormal"],
      "ref_range": "60 – 100"
    },
    {
      "metric":    "RR",
      "values":    ["16", "20", "24"],
      "flags":     [null, null, "borderline"],
      "ref_range": "12 – 20"
    },
    {
      "metric":    "SpO₂",
      "values":    ["98%", "96%", "93%"],
      "flags":     [null, null, "borderline"],
      "ref_range": "≥ 95%"
    },
    {
      "metric": "Temp",
      "values": ["36.8°C", "37.1°C", "37.3°C"],
      "flags":  [null, null, null]
    }
  ]'::jsonb,
  FALSE
);
