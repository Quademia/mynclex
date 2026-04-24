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


-- ─────────────────────────────────────────────────────────
-- Slice 1.11b — child questions at positions 1, 2, 3
-- Positions 4, 5, 6 intentionally left empty so the curator UI
-- renders the Q4+ / Q5+ / Q6+ empty-slot pills.
-- Each item_id uses a high numeric suffix so the seeded rows don't
-- collide with future authored items sharing the prefix.
-- ─────────────────────────────────────────────────────────

-- Q1 (Recognise cues) — MCQ
INSERT INTO nclex_bank_items (
  item_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  difficulty, tags,
  is_free_sample, is_builder_visible, is_published,
  marks, shuffle_options,
  parent_case_id
) VALUES (
  'NCLEX_MCQ_90001',
  'MCQ',
  'At 0800 the nurse completes a focused assessment. Which finding would the nurse identify as the priority cue to report?',
  'At 0800 the client is alert, afebrile, and describes mild incisional pain — expected post-op day 1 findings. The firmer abdomen and rising HR at 1200 are the significant cues; the 0800 assessment is baseline-normal.',
  '{"options": [
     {"id": "A", "text": "Abdominal dressing dry and intact"},
     {"id": "B", "text": "Incisional pain rated 3/10"},
     {"id": "C", "text": "Client alert and oriented x3"},
     {"id": "D", "text": "All findings are within expected post-op limits"}
   ]}'::jsonb,
  '{"answer": "D",
    "feedback": {
      "A": "Expected finding — not a priority cue.",
      "B": "Mild pain is expected on post-op day 1.",
      "C": "Expected mental status for this client.",
      "D": "Correct. All 0800 findings are within expected limits; the nurse should continue assessment."
    }}'::jsonb,
  'Physiological Integrity', 'Reduction of Risk Potential',
  'Easy', ARRAY['post-op', 'assessment'],
  FALSE, TRUE, FALSE,
  1, TRUE,
  'NCLEX_CS_00001'
);

-- Q2 (Analyse cues) — MCQ
INSERT INTO nclex_bank_items (
  item_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  difficulty, tags,
  is_free_sample, is_builder_visible, is_published,
  marks, shuffle_options,
  parent_case_id
) VALUES (
  'NCLEX_MCQ_90002',
  'MCQ',
  'By 1200 the client is restless, tachycardic, tachypneic, and febrile with SpO2 89% on room air. Which complication do these cues most likely suggest?',
  'The 1200 vital-signs trend (HR 118, RR 26, SpO2 89%, temp 38.4°C) combined with firmer abdomen and altered mental status fits early sepsis, likely from post-op peritonitis. Hypovolemia alone would not typically cause fever and hypoxia together.',
  '{"options": [
     {"id": "A", "text": "Hypovolemic shock from surgical bleeding"},
     {"id": "B", "text": "Early sepsis from post-operative peritonitis"},
     {"id": "C", "text": "Pulmonary embolism"},
     {"id": "D", "text": "Atelectasis"}
   ]}'::jsonb,
  '{"answer": "B",
    "feedback": {
      "A": "Hypovolemia could explain the BP and HR but not the fever or hypoxia.",
      "B": "Correct. The combination of fever, tachycardia, tachypnea, hypoxia, and abdominal rigidity fits sepsis / peritonitis post-op.",
      "C": "PE would cause hypoxia and tachycardia but not fever or abdominal rigidity.",
      "D": "Atelectasis could cause hypoxia but not the full pattern."
    }}'::jsonb,
  'Physiological Integrity', 'Physiological Adaptation',
  'Medium', ARRAY['sepsis', 'post-op'],
  FALSE, TRUE, FALSE,
  1, TRUE,
  'NCLEX_CS_00001'
);

-- Q3 (Prioritise) — SATA
INSERT INTO nclex_bank_items (
  item_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  difficulty, tags,
  is_free_sample, is_builder_visible, is_published,
  marks, shuffle_options,
  parent_case_id
) VALUES (
  'NCLEX_SATA_90001',
  'SATA',
  'Which nursing actions should the nurse prioritise at 1200? Select all that apply.',
  'Early sepsis requires prompt oxygen, vital-signs escalation to the provider, and IV access preparation for fluids and antibiotics. Morphine or ambulation would be inappropriate at this acuity; NPO status would typically be ordered by the provider, not nurse-initiated.',
  '{"options": [
     {"id": "A", "text": "Apply supplemental oxygen"},
     {"id": "B", "text": "Notify the provider with SBAR"},
     {"id": "C", "text": "Prepare a second large-bore IV line"},
     {"id": "D", "text": "Administer scheduled morphine"},
     {"id": "E", "text": "Assist the client to ambulate"},
     {"id": "F", "text": "Reassess vitals in 15 minutes"}
   ]}'::jsonb,
  '{"answers": ["A", "B", "C", "F"],
    "feedback": {
      "A": "Correct. SpO2 of 89% warrants immediate supplemental O2.",
      "B": "Correct. Trending deterioration needs provider escalation.",
      "C": "Correct. Fluids and likely IV antibiotics will need a second line.",
      "D": "Incorrect. Morphine can worsen hypotension in early shock.",
      "E": "Incorrect. Ambulation is contraindicated in this acuity.",
      "F": "Correct. Short-interval reassessment confirms trajectory."
    }}'::jsonb,
  'Physiological Integrity', 'Reduction of Risk Potential',
  'Medium', ARRAY['sepsis', 'prioritisation'],
  FALSE, TRUE, FALSE,
  1, TRUE,
  'NCLEX_CS_00001'
);


-- Join rows linking each slot to its bank_item + CJMM step.
INSERT INTO nclex_case_study_items (id, case_id, item_id, position, cjmm_step) VALUES
  ('NCLEX_CS_00001_J1', 'NCLEX_CS_00001', 'NCLEX_MCQ_90001',  1, 'Recognise cues'),
  ('NCLEX_CS_00001_J2', 'NCLEX_CS_00001', 'NCLEX_MCQ_90002',  2, 'Analyse cues'),
  ('NCLEX_CS_00001_J3', 'NCLEX_CS_00001', 'NCLEX_SATA_90001', 3, 'Prioritise');
