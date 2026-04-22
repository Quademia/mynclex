-- =========================================================
-- MyNclex — Dev seed: case studies (Slice 1.11a)
-- File: mynclex/db/seed-cases-dev.sql
-- =========================================================
-- One admin-side demo case with three chart tabs:
--   • Tab 1 — Nurses' Notes  (built-in narrative, 2 entries)
--   • Tab 2 — Vital Signs    (built-in structured, 3 entries)
--   • Tab 3 — Intake & Output (custom_grid, 2 entries)
-- No child questions yet — those ship in Slice 1.11b.
-- is_published = FALSE so the seed only surfaces for curators.
-- =========================================================

INSERT INTO nclex_case_studies (
  case_id,
  title,
  scenario_summary,
  is_published
) VALUES (
  'NCLEX_CS_00001',
  '72-year-old post-op day 1, deteriorating',
  'A 72-year-old male client is on post-op day 1 following open abdominal surgery for diverticulitis. The nurse enters the room at 0800 to perform a focused assessment before handover.',
  FALSE
);


-- Tab 1 — Nurses' Notes (built-in narrative)
INSERT INTO nclex_case_study_tabs (
  tab_id,
  case_id,
  tab_key,
  title,
  display_order,
  is_custom,
  custom_shape,
  columns_def,
  entries
) VALUES (
  'NCLEX_CS_00001_TAB_1',
  'NCLEX_CS_00001',
  'nurses_notes',
  'Nurses'' Notes',
  0,
  FALSE,
  NULL,
  '[]'::jsonb,
  '[
    {"visible_from": 1, "time": "0800", "body": "Client alert and oriented x3. Post-op day 1. Abdominal dressing dry and intact. No acute distress. Rates incisional pain 3/10."},
    {"visible_from": 3, "time": "1200", "body": "Increased restlessness. Client reports that something is not right. Skin warm, flushed. Abdomen firmer on palpation compared to 0800 exam."}
  ]'::jsonb
);


-- Tab 2 — Vital Signs (built-in structured)
INSERT INTO nclex_case_study_tabs (
  tab_id,
  case_id,
  tab_key,
  title,
  display_order,
  is_custom,
  custom_shape,
  columns_def,
  entries
) VALUES (
  'NCLEX_CS_00001_TAB_2',
  'NCLEX_CS_00001',
  'vital_signs',
  'Vital Signs',
  1,
  FALSE,
  NULL,
  '[]'::jsonb,
  '[
    {"visible_from": 1, "time": "0800", "bp": "132/88", "hr": "92",  "rr": "18", "spo2": "96%", "temp": "37.2", "pain": "3/10"},
    {"visible_from": 2, "time": "1000", "bp": "118/72", "hr": "108", "rr": "22", "spo2": "93%", "temp": "37.8", "pain": "5/10"},
    {"visible_from": 3, "time": "1200", "bp": "104/64", "hr": "118", "rr": "26", "spo2": "89%", "temp": "38.4", "pain": "7/10"}
  ]'::jsonb
);


-- Tab 3 — Intake & Output (custom_grid, curator-defined columns)
INSERT INTO nclex_case_study_tabs (
  tab_id,
  case_id,
  tab_key,
  title,
  display_order,
  is_custom,
  custom_shape,
  columns_def,
  entries
) VALUES (
  'NCLEX_CS_00001_TAB_3',
  'NCLEX_CS_00001',
  'custom_grid',
  'Intake & Output',
  2,
  TRUE,
  'rows_cols',
  '[
    {"id": "time",         "label": "Time"},
    {"id": "intake_ml",    "label": "Intake (mL)"},
    {"id": "output_ml",    "label": "Output (mL)"},
    {"id": "net",          "label": "Net"},
    {"id": "urine_colour", "label": "Urine colour"}
  ]'::jsonb,
  '[
    {"visible_from": 1, "time": "0800", "intake_ml": "400 (PO)",    "output_ml": "60", "net": "+340", "urine_colour": "Yellow, clear"},
    {"visible_from": 2, "time": "1000", "intake_ml": "200 (IV NS)", "output_ml": "45", "net": "+155", "urine_colour": "Dark yellow"}
  ]'::jsonb
);
