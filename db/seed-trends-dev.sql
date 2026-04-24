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


-- =========================================================
-- Slice 1.12b extension — two attached questions on the
-- demo dataset NCLEX_TRD_00001, one MCQ + one MATRIX. Both
-- are drafts (is_published = FALSE) so they only appear to
-- curators. is_builder_visible defaults TRUE (trend-linked
-- items are pickable from the student quiz builder — this
-- is the key difference from case-study children).
-- =========================================================

INSERT INTO nclex_bank_items (
  item_id, question_type, stem, instruction,
  content, correct,
  client_needs_category, nursing_subject, body_system,
  difficulty, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id
) VALUES
(
  'NCLEX_MCQ_91001',
  'MCQ',
  'Based on the trend data above, what is the priority concern at the 1000 timepoint?',
  NULL,
  '{"options":[{"id":"A","text":"Improving pain control"},{"id":"B","text":"Developing shock"},{"id":"C","text":"Resolving atelectasis"},{"id":"D","text":"Stable post-op recovery"}]}'::jsonb,
  '{"correct_id":"B"}'::jsonb,
  'Physiological Integrity',
  'Medical-Surgical',
  'Cardiovascular',
  'Medium',
  ARRAY['trend','post-op','shock'],
  FALSE, FALSE, TRUE,
  1, TRUE,
  'NCLEX_TRD_00001'
),
(
  'NCLEX_MAT_91001',
  'MATRIX',
  'For each vital sign trend shown above, classify the change.',
  NULL,
  '{"row_label":"Vital sign","rows":[{"id":"bp","text":"Blood pressure","feedback":""},{"id":"hr","text":"Heart rate","feedback":""},{"id":"rr","text":"Respiratory rate","feedback":""},{"id":"spo2","text":"Oxygen saturation","feedback":""}],"columns":[{"id":"improving","text":"Improving"},{"id":"stable","text":"Stable"},{"id":"deteriorating","text":"Deteriorating"}]}'::jsonb,
  '{"row_to_column":{"bp":"deteriorating","hr":"deteriorating","rr":"deteriorating","spo2":"deteriorating"}}'::jsonb,
  'Physiological Integrity',
  'Medical-Surgical',
  'Cardiovascular',
  'Medium',
  ARRAY['trend','post-op','matrix'],
  FALSE, FALSE, TRUE,
  1, TRUE,
  'NCLEX_TRD_00001'
)
ON CONFLICT (item_id) DO NOTHING;
