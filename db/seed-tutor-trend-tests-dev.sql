-- =========================================================
-- MyNclex — DEV-ONLY tutor-side trend wrapper-v2 test seed
-- File: mynclex/db/seed-tutor-trend-tests-dev.sql
-- Created: 2026-05-01
--
-- Purpose: tutor twin of seed-trend-tests-dev.sql. Same 6 datasets
-- (vitals, labs, io, neuro, assessment, custom) and 30 child
-- questions (covering all 9 types), but on the tutor surface tables.
-- Owned by tutor: mybackpacc+mynclextutor@gmail.com
--                  (uuid 4ed777d7-e4f7-403b-88f4-63ce5432d65e).
--
-- 6 datasets × 5 child questions = 30 questions.
-- Type coverage: MCQ×6, SATA×6, TF×3, SELECT_N×3, MATRIX×3,
-- BOWTIE×3, CLOZE×2, HIGHLIGHT×2, DRAG_DROP×2.
-- All rows tagged batch_id = 'TREND_TEST_TUTOR_2026_05_01'.
--
-- IDs are distinct from the admin twin so both can coexist on dev:
--   trend_id   : NCLEX_TRD_TEST_T01..T06   (admin uses 01..06)
--   item_id    : NCLEX_<TYPE>_TT01..TT30   (admin uses T01..T30)
--
-- HOW TO LOAD:
--   1. Open Supabase Studio → SQL Editor for the dev project.
--   2. Paste the contents of this file. Click "Run".
--   3. Log in as mybackpacc+mynclextutor@gmail.com on dev and
--      visit http://localhost:3000/tutor/bank/trends-v2 to see the
--      6 datasets; open each and verify all 5 children render in
--      every editor.
--
-- HOW TO CLEAN UP (paste these two statements when done):
--   DELETE FROM nclex_tutor_questions
--    WHERE batch_id = 'TREND_TEST_TUTOR_2026_05_01';
--   DELETE FROM nclex_tutor_trend_datasets
--    WHERE trend_id LIKE 'NCLEX_TRD_TEST_T%';
--
-- All rows ship with is_published = FALSE so nothing leaks to
-- student-side surfaces. is_builder_visible = TRUE so the items
-- show up in the student quiz builder for curator-side testing.
--
-- The whole file is wrapped in BEGIN/COMMIT — if any INSERT fails,
-- nothing persists. Safe to re-run after running the cleanup
-- statements above.
-- =========================================================

BEGIN;


-- =========================================================
-- TREND DATASETS (6 rows)
-- =========================================================

-- 1. Vitals — septic deterioration
INSERT INTO nclex_tutor_trend_datasets (
  trend_id, tutor_id, title, scenario, kind,
  timepoints, rows,
  is_published, is_free_sample, is_builder_visible
) VALUES (
  'NCLEX_TRD_TEST_T01',
  '4ed777d7-e4f7-403b-88f4-63ce5432d65e',
  'Vitals — post-op septic deterioration',
  '62F, post-op day 2 following bowel resection. Hourly vitals show progressive change. Test recognition of early sepsis trajectory.',
  'vitals',
  '["0800","1000","1200","1400"]'::jsonb,
  '[
    {"metric":"BP",  "values":["132/78","124/72","108/64","94/58"], "flags":[null,null,"borderline","abnormal"], "ref_range":"90/60 – 140/90"},
    {"metric":"HR",  "values":["88","98","112","128"],              "flags":[null,null,"borderline","abnormal"], "ref_range":"60 – 100"},
    {"metric":"RR",  "values":["18","20","24","28"],                "flags":[null,null,"borderline","abnormal"], "ref_range":"12 – 20"},
    {"metric":"Temp","values":["37.2°C","37.8°C","38.6°C","39.2°C"],"flags":[null,"borderline","abnormal","abnormal"]},
    {"metric":"SpO₂","values":["98%","97%","95%","92%"],            "flags":[null,null,null,"borderline"], "ref_range":"≥ 95%"}
  ]'::jsonb,
  FALSE, FALSE, TRUE
);


-- 2. Labs — CKD with rising potassium
INSERT INTO nclex_tutor_trend_datasets (
  trend_id, tutor_id, title, scenario, kind,
  timepoints, rows,
  is_published, is_free_sample, is_builder_visible
) VALUES (
  'NCLEX_TRD_TEST_T02',
  '4ed777d7-e4f7-403b-88f4-63ce5432d65e',
  'Labs — CKD with rising hyperkalemia',
  '70M with chronic kidney disease admitted with fatigue. Daily morning labs across 4 days. Test recognition of life-threatening hyperkalemia in renal failure.',
  'labs',
  '["Day 1","Day 2","Day 3","Day 4"]'::jsonb,
  '[
    {"metric":"K⁺ (mmol/L)",       "values":["4.8","5.4","6.1","6.8"], "flags":[null,"borderline","abnormal","abnormal"], "ref_range":"3.5 – 5.0"},
    {"metric":"Na⁺ (mmol/L)",      "values":["138","135","132","130"], "flags":[null,null,"borderline","borderline"],     "ref_range":"135 – 145"},
    {"metric":"Creatinine (mg/dL)","values":["2.1","2.6","3.2","3.9"], "flags":["abnormal","abnormal","abnormal","abnormal"], "ref_range":"< 1.3"},
    {"metric":"BUN (mg/dL)",       "values":["38","45","52","61"],     "flags":["abnormal","abnormal","abnormal","abnormal"], "ref_range":"7 – 20"}
  ]'::jsonb,
  FALSE, FALSE, TRUE
);


-- 3. I&O — decompensating heart failure
INSERT INTO nclex_tutor_trend_datasets (
  trend_id, tutor_id, title, scenario, kind,
  timepoints, rows,
  is_published, is_free_sample, is_builder_visible
) VALUES (
  'NCLEX_TRD_TEST_T03',
  '4ed777d7-e4f7-403b-88f4-63ce5432d65e',
  'I&O — decompensating heart failure',
  '58M with chronic systolic heart failure, admitted with new dyspnea. 24-hour intake & output by shift. Test recognition of cumulative fluid overload.',
  'io',
  '["Shift 1 (07-15)","Shift 2 (15-23)","Shift 3 (23-07)"]'::jsonb,
  '[
    {"metric":"IV intake (mL)",    "values":["800","1100","900"],     "flags":[null,null,null]},
    {"metric":"PO intake (mL)",    "values":["600","700","400"],      "flags":[null,null,null]},
    {"metric":"Urine output (mL)", "values":["350","280","220"],      "flags":["borderline","abnormal","abnormal"]},
    {"metric":"Net balance (mL)",  "values":["+1050","+1520","+1080"],"flags":["borderline","abnormal","abnormal"]}
  ]'::jsonb,
  FALSE, FALSE, TRUE
);


-- 4. Neuro — rising intracranial pressure
INSERT INTO nclex_tutor_trend_datasets (
  trend_id, tutor_id, title, scenario, kind,
  timepoints, rows,
  is_published, is_free_sample, is_builder_visible
) VALUES (
  'NCLEX_TRD_TEST_T04',
  '4ed777d7-e4f7-403b-88f4-63ce5432d65e',
  'Neuro — rising intracranial pressure',
  '32M with traumatic brain injury from MVC, admitted to ICU. Q1H neuro checks across 4 hours. Test recognition of Cushing''s triad and impending herniation.',
  'neuro',
  '["1800","1900","2000","2100"]'::jsonb,
  '[
    {"metric":"GCS",            "values":["14","12","10","8"],                                                                "flags":[null,"borderline","abnormal","abnormal"]},
    {"metric":"Pupils",         "values":["3mm equal reactive","4mm equal sluggish","5mm L>R sluggish","6mm L>R fixed"],     "flags":[null,"borderline","abnormal","abnormal"]},
    {"metric":"Motor strength", "values":["5/5 all extremities","4/5 R weakness","3/5 R weakness","Decorticate posturing"], "flags":[null,"borderline","abnormal","abnormal"]},
    {"metric":"BP",             "values":["128/72","138/68","152/64","178/58"],                                              "flags":[null,null,"borderline","abnormal"]},
    {"metric":"HR",             "values":["88","78","68","52"],                                                              "flags":[null,null,"borderline","abnormal"]},
    {"metric":"Resp pattern",   "values":["Regular 16","Regular 14","Irregular 12","Cheyne-Stokes 8"],                       "flags":[null,null,"borderline","abnormal"]}
  ]'::jsonb,
  FALSE, FALSE, TRUE
);


-- 5. Assessment — postpartum endometritis trajectory
INSERT INTO nclex_tutor_trend_datasets (
  trend_id, tutor_id, title, scenario, kind,
  timepoints, rows,
  is_published, is_free_sample, is_builder_visible
) VALUES (
  'NCLEX_TRD_TEST_T05',
  '4ed777d7-e4f7-403b-88f4-63ce5432d65e',
  'Assessment — postpartum endometritis trajectory',
  '28F, postpartum day 2 following vaginal delivery. Q4H assessments across 12 hours. Test recognition of postpartum infection.',
  'assessment',
  '["0800","1200","1600","2000"]'::jsonb,
  '[
    {"metric":"Temp (°C)",      "values":["37.3","37.8","38.4","39.1"],                                                                                          "flags":[null,"borderline","abnormal","abnormal"]},
    {"metric":"Fundal tone",    "values":["Firm at U","Firm at U","Boggy +2cm above U","Boggy +3cm above U, R-displaced"],                                       "flags":[null,null,"abnormal","abnormal"]},
    {"metric":"Lochia",         "values":["Rubra moderate","Rubra moderate, no odor","Rubra heavy, foul odor","Rubra heavy, foul odor with clots"],              "flags":[null,null,"abnormal","abnormal"]},
    {"metric":"Pain (0-10)",    "values":["3","4","6","8"],                                                                                                       "flags":[null,null,"borderline","abnormal"]},
    {"metric":"HR",             "values":["80","88","102","118"],                                                                                                 "flags":[null,null,"borderline","abnormal"]}
  ]'::jsonb,
  FALSE, FALSE, TRUE
);


-- 6. Custom — pain & sedation (opioid over-sedation)
INSERT INTO nclex_tutor_trend_datasets (
  trend_id, tutor_id, title, scenario, kind,
  timepoints, rows,
  is_published, is_free_sample, is_builder_visible
) VALUES (
  'NCLEX_TRD_TEST_T06',
  '4ed777d7-e4f7-403b-88f4-63ce5432d65e',
  'Pain & Sedation — opioid over-sedation on PCA',
  '52M post-op day 1 following thoracotomy on PCA morphine. Q2H pain & sedation assessments across 8 hours. Test recognition of opioid-induced respiratory depression.',
  'Pain & Sedation',
  '["0800","1000","1200","1400","1600"]'::jsonb,
  '[
    {"metric":"Pain (NRS 0-10)",       "values":["6","4","2","1","0"],                "flags":[null,null,null,null,null]},
    {"metric":"RASS (-5 to +4)",       "values":["0","-1","-2","-3","-4"],            "flags":[null,null,"borderline","abnormal","abnormal"]},
    {"metric":"Resp rate",              "values":["18","16","14","10","8"],            "flags":[null,null,null,"abnormal","abnormal"]},
    {"metric":"SpO₂",                   "values":["97%","96%","95%","92%","88%"],     "flags":[null,null,null,"borderline","abnormal"]},
    {"metric":"PCA demands/delivered",  "values":["6/4","5/3","4/3","3/2","2/2"],     "flags":[null,null,null,null,null]}
  ]'::jsonb,
  FALSE, FALSE, TRUE
);


-- =========================================================
-- CHILD QUESTIONS (30 rows, 5 per dataset)
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- Trend 1 (Vitals) — Q01–Q05
-- ─────────────────────────────────────────────────────────

-- Q01 — MCQ
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_MCQ_TT01', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'MCQ',
  'Based on the trend data above, which condition should the nurse suspect at the 1400 timepoint?',
  'Rising temperature with tachycardia, tachypnea, and falling BP in a post-op patient is the classic early-sepsis pattern. Hypovolemia would not produce fever; anaphylaxis is sudden, not progressive over 6 hours; PE typically presents with sudden hypoxia and chest pain.',
  '{"options":[{"id":"A","text":"Hypovolemic shock"},{"id":"B","text":"Sepsis"},{"id":"C","text":"Anaphylaxis"},{"id":"D","text":"Pulmonary embolism"}]}'::jsonb,
  '{"answer":"B","feedback":{"A":"Hypovolemia would not produce fever — the rising temperature points away from a purely volume cause.","B":"Correct. Fever + tachycardia + tachypnea + falling BP = early sepsis trajectory.","C":"Anaphylaxis is sudden onset, not a progressive 6-hour trend.","D":"PE typically presents with sudden hypoxia and chest pain, not gradually rising temperature."}}'::jsonb,
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Cardiovascular','Sepsis','Early recognition',
  'Medium','Analyze',ARRAY['trend','sepsis','post-op','vitals'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T01','TREND_TEST_TUTOR_2026_05_01'
);

-- Q02 — SATA
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_SATA_TT02', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'SATA',
  'Select all findings consistent with early sepsis based on the trend.',
  'SIRS criteria include temp > 38°C, HR > 90, RR > 20, and abnormal WBC. Falling BP indicates progression toward septic shock. Bradycardia is not a sepsis marker; SpO₂ improvement would be reassuring, not concerning.',
  '{"options":[{"id":"A","text":"Rising temperature"},{"id":"B","text":"Increasing heart rate"},{"id":"C","text":"Decreasing blood pressure"},{"id":"D","text":"Bradycardia"},{"id":"E","text":"Increasing respiratory rate"}]}'::jsonb,
  '{"answers":["A","B","C","E"],"feedback":{"A":"Fever is a SIRS criterion and a hallmark of early sepsis.","B":"HR > 90 meets SIRS; reflects compensatory response to infection.","C":"Falling BP signals progression to septic shock.","D":"Sepsis causes tachycardia, not bradycardia.","E":"RR > 20 meets SIRS criteria."}}'::jsonb,
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Cardiovascular','Sepsis','SIRS criteria',
  'Medium','Analyze',ARRAY['trend','sepsis','SATA','SIRS'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T01','TREND_TEST_TUTOR_2026_05_01'
);

-- Q03 — TF
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_TF_TT03', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'TF',
  'At the 1400 timepoint, the patient meets at least 2 SIRS criteria.',
  'SIRS requires ≥ 2 of: temp > 38°C or < 36°C; HR > 90; RR > 20 or PaCO₂ < 32; WBC > 12k or < 4k or > 10% bands. At 1400 the patient has temp 39.2°C, HR 128, RR 28 — three criteria met.',
  '{"options":[{"id":"T","text":"True"},{"id":"F","text":"False"}]}'::jsonb,
  '{"answer":"T","feedback":{"T":"Correct. Temp 39.2, HR 128, RR 28 — three SIRS criteria met.","F":"Incorrect. Three SIRS criteria are clearly present at 1400."}}'::jsonb,
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Cardiovascular','Sepsis','SIRS criteria',
  'Easy','Remember',ARRAY['trend','sepsis','TF'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T01','TREND_TEST_TUTOR_2026_05_01'
);

-- Q04 — SELECT_N
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_SELN_TT04', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'SELECT_N',
  'Choose the 2 priority interventions at the 1400 timepoint.',
  'Sepsis bundle priorities at recognition: STAT provider notification + blood cultures BEFORE antibiotics (cultures lose yield once antibiotics are running). Discharge planning, oral medication switch, and ambulation are inappropriate in a deteriorating patient.',
  '{"options":[{"id":"A","text":"Notify provider STAT"},{"id":"B","text":"Obtain blood cultures before antibiotics"},{"id":"C","text":"Begin discharge planning"},{"id":"D","text":"Switch antibiotics to oral form"},{"id":"E","text":"Encourage ambulation"}],"select_count":2}'::jsonb,
  '{"answers":["A","B"],"feedback":{"A":"Provider notification activates the sepsis bundle pathway.","B":"Cultures must be drawn before antibiotics start, or yield drops sharply.","C":"Discharge planning is inappropriate in a deteriorating patient.","D":"Oral antibiotics are too slow and unreliable in suspected sepsis.","E":"Ambulation is not a sepsis priority and may worsen hypotension."}}'::jsonb,
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Cardiovascular','Sepsis','Sepsis bundle',
  'Medium','Apply',ARRAY['trend','sepsis','select-n'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T01','TREND_TEST_TUTOR_2026_05_01'
);

-- Q05 — MATRIX
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_MAT_TT05', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'MATRIX',
  'For each vital sign, classify the change between 0800 and 1400.',
  'Every vital sign in this dataset moves in the wrong direction across the 6 hours: BP drops 38 points, HR climbs 40, RR climbs 10, Temp climbs 2°C. Pattern recognition: all four worsening = systemic process, not a single-organ event.',
  '{"row_label":"Vital sign","rows":[{"id":"r_bp","text":"Blood pressure"},{"id":"r_hr","text":"Heart rate"},{"id":"r_rr","text":"Respiratory rate"},{"id":"r_temp","text":"Temperature"}],"columns":[{"id":"c_imp","text":"Improving"},{"id":"c_stb","text":"Stable"},{"id":"c_wor","text":"Worsening"}]}'::jsonb,
  '{"cells":{"r_bp":"c_wor","r_hr":"c_wor","r_rr":"c_wor","r_temp":"c_wor"},"feedback":{"r_bp":"BP 132/78 → 94/58 — clearly dropping.","r_hr":"HR 88 → 128 — clearly rising.","r_rr":"RR 18 → 28 — clearly rising.","r_temp":"Temp 37.2 → 39.2 — fever."}}'::jsonb,
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Cardiovascular','Sepsis','Trend interpretation',
  'Medium','Analyze',ARRAY['trend','sepsis','matrix'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T01','TREND_TEST_TUTOR_2026_05_01'
);


-- ─────────────────────────────────────────────────────────
-- Trend 2 (Labs) — Q06–Q10
-- ─────────────────────────────────────────────────────────

-- Q06 — MCQ
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_MCQ_TT06', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'MCQ',
  'Which lab change requires the most immediate provider notification?',
  'K⁺ above 6.0 carries imminent risk of fatal arrhythmia (peaked T waves → QRS widening → sine wave → asystole). Rising creatinine and BUN reflect worsening renal function — concerning but not immediately life-threatening. Mild hyponatremia at 130 is borderline, monitor.',
  '{"options":[{"id":"A","text":"Rising K⁺ (now 6.8 mmol/L)"},{"id":"B","text":"Rising BUN (now 61 mg/dL)"},{"id":"C","text":"Rising creatinine (now 3.9 mg/dL)"},{"id":"D","text":"Falling Na⁺ (now 130 mmol/L)"}]}'::jsonb,
  '{"answer":"A","feedback":{"A":"Correct. K⁺ > 6.0 is a cardiac emergency — peaked T waves can rapidly progress to fatal arrhythmia.","B":"BUN reflects renal trend; concerning but not the most acute risk.","C":"Creatinine 3.9 indicates significant CKD progression but is not the immediate priority.","D":"Mild hyponatremia at 130 is borderline — monitor, not the priority."}}'::jsonb,
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Renal','Hyperkalemia','CKD complications',
  'Medium','Analyze',ARRAY['trend','labs','hyperkalemia','CKD'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T02','TREND_TEST_TUTOR_2026_05_01'
);

-- Q07 — SATA
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_SATA_TT07', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'SATA',
  'Select all expected ECG findings of severe hyperkalemia.',
  'Hyperkalemia ECG progression: peaked T → prolonged PR → widened QRS → loss of P waves → sine wave → asystole. Shortened QT and U waves are features of hypokalemia, not hyperkalemia.',
  '{"options":[{"id":"A","text":"Peaked T waves"},{"id":"B","text":"Prolonged PR interval"},{"id":"C","text":"Widened QRS"},{"id":"D","text":"Shortened QT interval"},{"id":"E","text":"Prominent U waves"}]}'::jsonb,
  '{"answers":["A","B","C"],"feedback":{"A":"Peaked T waves are the earliest ECG sign of hyperkalemia.","B":"PR prolongation reflects slowed AV conduction.","C":"QRS widening signals critical hyperkalemia approaching arrhythmia threshold.","D":"Shortened QT is a feature of hypercalcemia, not hyperkalemia.","E":"U waves classically appear in hypokalemia, not hyperkalemia."}}'::jsonb,
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Cardiovascular','Hyperkalemia','ECG changes',
  'Medium','Remember',ARRAY['trend','labs','ECG','hyperkalemia'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T02','TREND_TEST_TUTOR_2026_05_01'
);

-- Q08 — BOWTIE
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_BT_TT08', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'BOWTIE',
  'Build the bow-tie for this patient at the Day 4 timepoint.',
  'Hyperkalemia in CKD: stabilise the cardiac membrane (calcium gluconate), then drive K⁺ intracellularly (insulin + dextrose). Continuous cardiac rhythm and serial K⁺ are the monitoring priorities. Adding K⁺ or increasing ACE inhibitor would worsen the picture.',
  '{"left":{"label":"Actions to take","tokens":[{"id":"lt1","text":"Administer IV calcium gluconate"},{"id":"lt2","text":"Administer IV insulin with dextrose"},{"id":"lt3","text":"Administer IV potassium replacement"},{"id":"lt4","text":"Increase ACE inhibitor dose"}]},"centre":{"label":"Condition","tokens":[{"id":"ct1","text":"Hyperkalemia in CKD"},{"id":"ct2","text":"Hyponatremia"},{"id":"ct3","text":"Volume depletion"}]},"right":{"label":"Parameters to monitor","tokens":[{"id":"rt1","text":"Continuous cardiac rhythm"},{"id":"rt2","text":"Serial K⁺ levels"},{"id":"rt3","text":"Bowel sounds"},{"id":"rt4","text":"Pupil response"}]}}'::jsonb,
  '{"left":["lt1","lt2"],"centre":"ct1","right":["rt1","rt2"],"feedback":{"lt1":"Calcium stabilises the cardiac membrane while other treatments work.","lt2":"Insulin drives K⁺ into cells; dextrose prevents hypoglycemia.","lt3":"Adding K⁺ would worsen the emergency.","lt4":"ACE inhibitors raise K⁺ — should be held in CKD with hyperkalemia.","ct1":"Rising K⁺ in declining renal function fits the picture.","ct2":"Na 130 is mild hyponatremia, not the primary problem.","ct3":"No volume signs — the issue is electrolyte, not fluid status.","rt1":"Continuous cardiac monitoring catches arrhythmias early.","rt2":"Serial K⁺ tracks treatment response.","rt3":"Not relevant to hyperkalemia management.","rt4":"Not relevant to hyperkalemia management."}}'::jsonb,
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Renal','Hyperkalemia','CKD complications',
  'Hard','Apply',ARRAY['trend','labs','bowtie','hyperkalemia'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T02','TREND_TEST_TUTOR_2026_05_01'
);

-- Q09 — HIGHLIGHT
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct, instruction,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_HL_TT09', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'HIGHLIGHT',
  'Day 4 lab review: K⁺ [[6.8 mmol/L]], creatinine [[3.9 mg/dL]], BUN [[61 mg/dL]], Na⁺ [[130 mmol/L]], calcium [[9.2 mg/dL]], magnesium [[2.0 mg/dL]].',
  'K⁺ above 6.0 is the only value requiring immediate action — risk of fatal arrhythmia. Cr/BUN are abnormal but reflect known CKD trajectory, not an acute emergency. Na 130 is borderline. Calcium and magnesium are within normal range.',
  '{"chunks":[{"id":"h1","text":"6.8 mmol/L"},{"id":"h2","text":"3.9 mg/dL"},{"id":"h3","text":"61 mg/dL"},{"id":"h4","text":"130 mmol/L"},{"id":"h5","text":"9.2 mg/dL"},{"id":"h6","text":"2.0 mg/dL"}]}'::jsonb,
  '{"correct_ids":["h1"],"feedback":{"h1":"K⁺ 6.8 is a cardiac emergency requiring immediate intervention.","h2":"Creatinine 3.9 is abnormal but reflects expected CKD trajectory.","h3":"BUN 61 reflects known renal failure, not an acute change.","h4":"Sodium 130 is borderline low — monitor, not urgent.","h5":"Calcium 9.2 is within normal range.","h6":"Magnesium 2.0 is within normal range."}}'::jsonb,
  'Highlight the value(s) requiring immediate provider notification.',
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Renal','Hyperkalemia','Lab interpretation',
  'Medium','Analyze',ARRAY['trend','labs','highlight','hyperkalemia'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T02','TREND_TEST_TUTOR_2026_05_01'
);

-- Q10 — CLOZE
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_CLZ_TT10', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'CLOZE',
  'Potassium is trending {1}, which puts the client at risk for {2}. The immediate priority is to {3}.',
  'Hyperkalemia in CKD predisposes to fatal arrhythmia. First-line treatment is calcium gluconate to stabilise the cardiac membrane while insulin/dextrose drives K⁺ intracellularly.',
  '{"blanks":[{"id":"b1","choices":[{"id":"b1c1","text":"upward"},{"id":"b1c2","text":"downward"},{"id":"b1c3","text":"stable"}]},{"id":"b2","choices":[{"id":"b2c1","text":"fatal cardiac arrhythmia"},{"id":"b2c2","text":"hypoglycemia"},{"id":"b2c3","text":"fluid overload"}]},{"id":"b3","choices":[{"id":"b3c1","text":"stabilise the cardiac membrane with IV calcium"},{"id":"b3c2","text":"restrict sodium intake"},{"id":"b3c3","text":"encourage oral fluids"}]}]}'::jsonb,
  '{"answers":{"b1":"b1c1","b2":"b2c1","b3":"b3c1"},"feedback":{"b1":{"b1c1":"Correct. K⁺ has risen from 4.8 to 6.8 across 4 days.","b1c2":"Values are rising, not falling.","b1c3":"Values are not stable — they are rising sharply."},"b2":{"b2c1":"Correct. Hyperkalemia at this level can cause fatal arrhythmia.","b2c2":"Hypoglycemia is a concern with insulin treatment, not the K⁺ trend itself.","b2c3":"Fluid overload is a CKD complication but not the K⁺-driven risk."},"b3":{"b3c1":"Correct. Calcium gluconate is the first-line cardioprotective intervention.","b3c2":"Sodium restriction is a chronic CKD measure, not the acute priority.","b3c3":"Oral fluids do not address the cardiac risk."}}}'::jsonb,
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Renal','Hyperkalemia','Clinical reasoning',
  'Medium','Apply',ARRAY['trend','labs','cloze','hyperkalemia'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T02','TREND_TEST_TUTOR_2026_05_01'
);


-- ─────────────────────────────────────────────────────────
-- Trend 3 (I&O) — Q11–Q15
-- ─────────────────────────────────────────────────────────

-- Q11 — MCQ
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_MCQ_TT11', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'MCQ',
  'What does the cumulative net balance over 24 hours indicate?',
  'Total net = +1050 +1520 +1080 = +3650 mL retained. With falling urine output and a known HF history, this is decompensation with fluid overload, not appropriate replacement or euvolemia.',
  '{"options":[{"id":"A","text":"Appropriate fluid replacement"},{"id":"B","text":"Dehydration"},{"id":"C","text":"Fluid overload"},{"id":"D","text":"Euvolemic state"}]}'::jsonb,
  '{"answer":"C","feedback":{"A":"+3650 mL is far in excess of replacement — this is retention.","B":"Net positive balance is the opposite of dehydration.","C":"Correct. Cumulative +3650 mL with falling UOP indicates decompensation.","D":"A patient retaining 3.65 L is not euvolemic."}}'::jsonb,
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Cardiovascular','Heart failure','Fluid balance',
  'Easy','Analyze',ARRAY['trend','io','HF','fluid-overload'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T03','TREND_TEST_TUTOR_2026_05_01'
);

-- Q12 — TF
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_TF_TT12', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'TF',
  'The client is in positive fluid balance over the 24-hour period.',
  'Sum of net values: +1050 + 1520 + 1080 = +3650 mL. Positive balance means more in than out. This is the textbook pattern for fluid retention in HF.',
  '{"options":[{"id":"T","text":"True"},{"id":"F","text":"False"}]}'::jsonb,
  '{"answer":"T","feedback":{"T":"Correct. Total net +3650 mL — clearly positive.","F":"Incorrect. All three shifts show positive balance summing to +3650 mL."}}'::jsonb,
  'Physiological Integrity','Basic Care and Comfort',
  'Medical-Surgical','Cardiovascular','Heart failure','Fluid balance',
  'Easy','Remember',ARRAY['trend','io','HF','TF'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T03','TREND_TEST_TUTOR_2026_05_01'
);

-- Q13 — SATA
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_SATA_TT13', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'SATA',
  'Select all assessments the nurse should now obtain.',
  'Fluid overload assessment focuses on pulmonary (crackles, SpO₂), peripheral (edema), and weight (most sensitive trending tool). Bowel sounds are not the priority in HF decompensation.',
  '{"options":[{"id":"A","text":"Auscultate lung sounds"},{"id":"B","text":"Daily weight"},{"id":"C","text":"Peripheral edema check"},{"id":"D","text":"SpO₂"},{"id":"E","text":"Bowel sounds"}]}'::jsonb,
  '{"answers":["A","B","C","D"],"feedback":{"A":"Crackles signal pulmonary edema — the feared complication.","B":"Daily weight is the most sensitive measure of fluid status.","C":"Peripheral edema reflects systemic congestion.","D":"SpO₂ trends with pulmonary edema severity.","E":"Not the priority assessment for HF fluid overload."}}'::jsonb,
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Cardiovascular','Heart failure','Assessment',
  'Easy','Apply',ARRAY['trend','io','HF','SATA'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T03','TREND_TEST_TUTOR_2026_05_01'
);

-- Q14 — DRAG_DROP (ORDERED)
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct, instruction,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_DD_TT14', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'DRAG_DROP',
  'A client with the trend above suddenly reports increased dyspnea. The nurse must respond.',
  'Standard HF decompensation response: position for breathing first (HOB up), give the prescribed treatment, reassess for response, escalate with the response data, then document. Restraints and increasing fluids would worsen the picture.',
  '{"subtype":"ORDERED","slots":[{"id":"s1","target_text":"1st action"},{"id":"s2","target_text":"2nd action"},{"id":"s3","target_text":"3rd action"},{"id":"s4","target_text":"4th action"},{"id":"s5","target_text":"5th action"}],"tokens":[{"id":"t1","text":"Elevate HOB to 30°"},{"id":"t2","text":"Administer prescribed IV diuretic"},{"id":"t3","text":"Reassess lung sounds and SpO₂"},{"id":"t4","text":"Notify provider with response"},{"id":"t5","text":"Document I&O"},{"id":"t6","text":"Apply soft restraints"},{"id":"t7","text":"Increase IV maintenance fluids"}]}'::jsonb,
  '{"slots":{"s1":"t1","s2":"t2","s3":"t3","s4":"t4","s5":"t5"},"feedback":{"s1":"Position before pharmacology — gravity assists pulmonary drainage immediately.","s2":"Diuretic addresses the volume problem.","s3":"Reassessment validates response before escalation.","s4":"Provider notification carries the new data, not the original concern.","s5":"Documentation closes the loop after intervention."}}'::jsonb,
  'Rank these actions from first (highest priority) to last.',
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Cardiovascular','Heart failure','Decompensation response',
  'Hard','Apply',ARRAY['trend','io','drag-drop','ordered','HF'],
  FALSE,FALSE,TRUE,1,FALSE,
  'NCLEX_TRD_TEST_T03','TREND_TEST_TUTOR_2026_05_01'
);

-- Q15 — SELECT_N
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_SELN_TT15', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'SELECT_N',
  'Pick the 3 expected outcomes after diuretic administration.',
  'Diuretic response: increased urine output (direct effect), decreased crackles (pulmonary congestion clearing), and weight loss (volume removal). BP increase and hypoglycemia are not expected effects.',
  '{"options":[{"id":"A","text":"Increased urine output"},{"id":"B","text":"Decreased crackles on auscultation"},{"id":"C","text":"Weight loss"},{"id":"D","text":"Increased blood pressure"},{"id":"E","text":"Hypoglycemia"}],"select_count":3}'::jsonb,
  '{"answers":["A","B","C"],"feedback":{"A":"Direct diuretic effect.","B":"Decreased pulmonary congestion follows volume removal.","C":"Weight is the most sensitive marker of diuretic response.","D":"Diuretics tend to lower BP, not raise it.","E":"Not an expected effect of loop diuretics."}}'::jsonb,
  'Physiological Integrity','Pharmacological and Parenteral Therapies',
  'Medical-Surgical','Cardiovascular','Heart failure','Diuretic response',
  'Medium','Evaluate',ARRAY['trend','io','HF','select-n'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T03','TREND_TEST_TUTOR_2026_05_01'
);


-- ─────────────────────────────────────────────────────────
-- Trend 4 (Neuro) — Q16–Q20
-- ─────────────────────────────────────────────────────────

-- Q16 — MCQ
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_MCQ_TT16', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'MCQ',
  'These trends are most consistent with which condition?',
  'Falling GCS, asymmetric pupils, decorticate posturing, widening pulse pressure, bradycardia, and Cheyne-Stokes respirations are the classic Cushing''s triad of impending herniation from rising ICP.',
  '{"options":[{"id":"A","text":"Hypovolemic shock"},{"id":"B","text":"Rising ICP with impending herniation"},{"id":"C","text":"Bacterial meningitis"},{"id":"D","text":"Ischemic stroke"}]}'::jsonb,
  '{"answer":"B","feedback":{"A":"Shock causes tachycardia, not bradycardia.","B":"Correct. Cushing''s triad (widening pulse pressure, bradycardia, irregular respirations) signals herniation.","C":"Meningitis causes fever and nuchal rigidity, not Cushing''s triad.","D":"Stroke causes focal deficits but not this BP/HR/respiratory pattern."}}'::jsonb,
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Neurological','Increased ICP','Cushing''s triad',
  'Hard','Analyze',ARRAY['trend','neuro','ICP','Cushings'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T04','TREND_TEST_TUTOR_2026_05_01'
);

-- Q17 — SATA
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_SATA_TT17', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'SATA',
  'Select all components of Cushing''s triad present at 2100.',
  'Cushing''s triad: (1) widening pulse pressure (systolic up, diastolic down), (2) bradycardia, (3) irregular respirations. Tachycardia and hypotension are features of shock, not Cushing''s.',
  '{"options":[{"id":"A","text":"Widening pulse pressure (178/58)"},{"id":"B","text":"Bradycardia (HR 52)"},{"id":"C","text":"Irregular respirations (Cheyne-Stokes)"},{"id":"D","text":"Tachycardia"},{"id":"E","text":"Hypotension"}]}'::jsonb,
  '{"answers":["A","B","C"],"feedback":{"A":"Pulse pressure 120 (178-58) — widening reflects ICP-driven SBP rise.","B":"HR 52 — bradycardia is the second leg of the triad.","C":"Cheyne-Stokes is irregular respiration — the third leg.","D":"The patient is bradycardic, not tachycardic.","E":"BP is hypertensive (178), not low."}}'::jsonb,
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Neurological','Increased ICP','Cushing''s triad',
  'Medium','Remember',ARRAY['trend','neuro','ICP','SATA'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T04','TREND_TEST_TUTOR_2026_05_01'
);

-- Q18 — MATRIX
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_MAT_TT18', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'MATRIX',
  'For each finding, classify the change between 1800 and 2100.',
  'GCS dropping from 14 to 8 = worsening. Pupils going from equal-reactive to L>R fixed = worsening. BP widening pulse pressure = worsening (Cushing''s). HR dropping from 88 to 52 = worsening (bradycardia of Cushing''s).',
  '{"row_label":"Finding","rows":[{"id":"r_gcs","text":"GCS"},{"id":"r_pup","text":"Pupils"},{"id":"r_bp","text":"Blood pressure pattern"},{"id":"r_hr","text":"Heart rate"}],"columns":[{"id":"c_imp","text":"Improving"},{"id":"c_stb","text":"Stable"},{"id":"c_wor","text":"Worsening"}]}'::jsonb,
  '{"cells":{"r_gcs":"c_wor","r_pup":"c_wor","r_bp":"c_wor","r_hr":"c_wor"},"feedback":{"r_gcs":"GCS 14 → 8 — clearly declining consciousness.","r_pup":"Equal reactive → L>R fixed — herniation pattern.","r_bp":"Widening pulse pressure — Cushing''s response.","r_hr":"88 → 52 — bradycardia of Cushing''s triad."}}'::jsonb,
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Neurological','Increased ICP','Trend interpretation',
  'Medium','Analyze',ARRAY['trend','neuro','ICP','matrix'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T04','TREND_TEST_TUTOR_2026_05_01'
);

-- Q19 — HIGHLIGHT
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct, instruction,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_HL_TT19', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'HIGHLIGHT',
  '21:00 assessment: GCS [[8]], pupil [[6mm L>R fixed]], motor [[decorticate posturing]], BP [[178/58]], HR [[52]], respirations [[Cheyne-Stokes]], temperature [[37.4°C]], SpO₂ [[98%]].',
  'Six findings indicate worsening neurologic status (GCS, pupils, posturing, widened pulse pressure, bradycardia, Cheyne-Stokes). Temperature and SpO₂ are within normal range and not part of this picture.',
  '{"chunks":[{"id":"h1","text":"8"},{"id":"h2","text":"6mm L>R fixed"},{"id":"h3","text":"decorticate posturing"},{"id":"h4","text":"178/58"},{"id":"h5","text":"52"},{"id":"h6","text":"Cheyne-Stokes"},{"id":"h7","text":"37.4°C"},{"id":"h8","text":"98%"}]}'::jsonb,
  '{"correct_ids":["h1","h2","h3","h4","h5","h6"],"feedback":{"h1":"GCS 8 = severe impairment.","h2":"Asymmetric fixed pupil = herniation.","h3":"Decorticate posturing = severe brain injury.","h4":"Widened pulse pressure = Cushing''s response.","h5":"Bradycardia = Cushing''s response.","h6":"Cheyne-Stokes = brainstem dysfunction.","h7":"Temperature is within normal range.","h8":"Oxygen saturation is within normal range."}}'::jsonb,
  'Highlight all findings indicating worsening neurologic status.',
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Neurological','Increased ICP','Red-flag findings',
  'Medium','Analyze',ARRAY['trend','neuro','highlight','ICP'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T04','TREND_TEST_TUTOR_2026_05_01'
);

-- Q20 — BOWTIE
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_BT_TT20', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'BOWTIE',
  'Build the bow-tie for this patient at the 2100 timepoint.',
  'Rising ICP management: HOB elevated 30° to optimise venous drainage; head midline to avoid jugular compression. Trendelenburg would worsen ICP; routine hyperventilation is no longer recommended. Monitor GCS and pupil response continuously.',
  '{"left":{"label":"Actions to take","tokens":[{"id":"lt1","text":"Elevate HOB to 30°"},{"id":"lt2","text":"Maintain head midline"},{"id":"lt3","text":"Place in Trendelenburg position"},{"id":"lt4","text":"Hyperventilate routinely"}]},"centre":{"label":"Condition","tokens":[{"id":"ct1","text":"Increased intracranial pressure"},{"id":"ct2","text":"Bacterial meningitis"},{"id":"ct3","text":"Septic shock"}]},"right":{"label":"Parameters to monitor","tokens":[{"id":"rt1","text":"GCS trend"},{"id":"rt2","text":"Pupil response"},{"id":"rt3","text":"Bowel sounds"},{"id":"rt4","text":"Urine specific gravity"}]}}'::jsonb,
  '{"left":["lt1","lt2"],"centre":"ct1","right":["rt1","rt2"],"feedback":{"lt1":"HOB 30° optimises cerebral venous drainage.","lt2":"Midline alignment prevents jugular compression.","lt3":"Trendelenburg increases ICP — contraindicated.","lt4":"Routine hyperventilation can worsen cerebral ischemia.","ct1":"Cushing''s triad confirms rising ICP.","ct2":"No fever or nuchal rigidity in this picture.","ct3":"BP is high, not low — not septic shock.","rt1":"GCS trend is the most sensitive ICP measure.","rt2":"Pupillary asymmetry signals herniation.","rt3":"Not relevant to ICP monitoring.","rt4":"Not relevant to ICP monitoring."}}'::jsonb,
  'Physiological Integrity','Physiological Adaptation',
  'Medical-Surgical','Neurological','Increased ICP','Nursing management',
  'Hard','Apply',ARRAY['trend','neuro','bowtie','ICP'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T04','TREND_TEST_TUTOR_2026_05_01'
);


-- ─────────────────────────────────────────────────────────
-- Trend 5 (Assessment) — Q21–Q25
-- ─────────────────────────────────────────────────────────

-- Q21 — MCQ
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_MCQ_TT21', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'MCQ',
  'These trends are most concerning for which condition?',
  'Postpartum endometritis: rising temperature, foul-smelling lochia, boggy/displaced fundus (uterine subinvolution), and tachycardia. Normal involution would show firming fundus and decreasing pain. PPD is psychiatric, not febrile. DVT presents with calf findings, not these systemic features.',
  '{"options":[{"id":"A","text":"Normal postpartum involution"},{"id":"B","text":"Postpartum endometritis"},{"id":"C","text":"Postpartum depression"},{"id":"D","text":"Deep vein thrombosis"}]}'::jsonb,
  '{"answer":"B","feedback":{"A":"Normal involution shows firming fundus and resolving findings, not worsening.","B":"Correct. Fever + foul lochia + boggy fundus + tachycardia = endometritis.","C":"PPD does not produce fever or uterine findings.","D":"DVT presents with calf swelling and pain, not this picture."}}'::jsonb,
  'Health Promotion and Maintenance','Health Promotion and Maintenance',
  'Maternity','Reproductive','Postpartum complications','Endometritis',
  'Medium','Analyze',ARRAY['trend','assessment','postpartum','endometritis'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T05','TREND_TEST_TUTOR_2026_05_01'
);

-- Q22 — SATA
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_SATA_TT22', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'SATA',
  'Select all findings at the 2000 timepoint that warrant immediate provider notification.',
  'Fever > 38°C, foul lochia (infection sign), boggy displaced fundus (uterine atony with possible retained tissue), and tachycardia (early sepsis sign) all warrant immediate notification. Pain 8/10 is significant but addressable with prescribed analgesia first.',
  '{"options":[{"id":"A","text":"Temp 39.1°C"},{"id":"B","text":"Foul-smelling lochia"},{"id":"C","text":"Boggy displaced fundus"},{"id":"D","text":"HR 118"},{"id":"E","text":"Pain 8/10"}]}'::jsonb,
  '{"answers":["A","B","C","D"],"feedback":{"A":"High fever in postpartum requires immediate workup.","B":"Foul lochia is a hallmark infection sign.","C":"Boggy + displaced fundus suggests retained products or uterine atony with infection.","D":"Tachycardia at 118 is an early sepsis warning.","E":"Pain is significant but addressable with prescribed analgesia first; not the immediate notification priority."}}'::jsonb,
  'Health Promotion and Maintenance','Health Promotion and Maintenance',
  'Maternity','Reproductive','Postpartum complications','Endometritis',
  'Medium','Analyze',ARRAY['trend','assessment','postpartum','SATA'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T05','TREND_TEST_TUTOR_2026_05_01'
);

-- Q23 — CLOZE
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_CLZ_TT23', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'CLOZE',
  'The fundus at 2000 is {1} and {2}, suggesting {3}.',
  'Boggy + R-displaced fundus on postpartum day 2 with fever and foul lochia suggests endometritis, not normal involution or vaginal hematoma. A firm, midline fundus would indicate normal involution.',
  '{"blanks":[{"id":"b1","choices":[{"id":"b1c1","text":"boggy"},{"id":"b1c2","text":"firm"},{"id":"b1c3","text":"contracted"}]},{"id":"b2","choices":[{"id":"b2c1","text":"displaced"},{"id":"b2c2","text":"midline"}]},{"id":"b3","choices":[{"id":"b3c1","text":"endometritis with possible retained products"},{"id":"b3c2","text":"normal postpartum involution"},{"id":"b3c3","text":"vaginal hematoma"}]}]}'::jsonb,
  '{"answers":{"b1":"b1c1","b2":"b2c1","b3":"b3c1"},"feedback":{"b1":{"b1c1":"Correct. The 2000 entry says boggy.","b1c2":"A firm fundus indicates normal involution; not the case here.","b1c3":"Contracted is the same as firm — not what is documented."},"b2":{"b2c1":"Correct. The fundus is R-displaced.","b2c2":"Midline placement is normal; the documented finding is displaced."},"b3":{"b3c1":"Correct. Boggy + displaced + fever + foul lochia = endometritis pattern.","b3c2":"Normal involution would show firm midline fundus and resolving lochia.","b3c3":"Vaginal hematoma presents with localised swelling and severe pain, not these systemic findings."}}}'::jsonb,
  'Health Promotion and Maintenance','Health Promotion and Maintenance',
  'Maternity','Reproductive','Postpartum complications','Endometritis',
  'Medium','Apply',ARRAY['trend','assessment','postpartum','cloze'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T05','TREND_TEST_TUTOR_2026_05_01'
);

-- Q24 — TF
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_TF_TT24', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'TF',
  'These findings are consistent with normal postpartum involution.',
  'Normal involution: firm midline fundus descending 1 cm/day, lochia rubra → serosa → alba, decreasing pain, no fever. This patient shows the opposite trajectory on every axis.',
  '{"options":[{"id":"T","text":"True"},{"id":"F","text":"False"}]}'::jsonb,
  '{"answer":"F","feedback":{"T":"Incorrect. The findings worsen across the trend, opposite of normal involution.","F":"Correct. Rising fever, foul lochia, boggy displaced fundus = pathology, not normal involution."}}'::jsonb,
  'Health Promotion and Maintenance','Health Promotion and Maintenance',
  'Maternity','Reproductive','Postpartum complications','Normal vs abnormal',
  'Easy','Evaluate',ARRAY['trend','assessment','postpartum','TF'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T05','TREND_TEST_TUTOR_2026_05_01'
);

-- Q25 — DRAG_DROP (SENTENCE)
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct, instruction,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_DD_TT25', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'DRAG_DROP',
  'After identifying these findings, the nurse should [1], then [2], and [3] before antibiotic therapy is initiated.',
  'Sepsis-bundle workflow: get the full vitals picture first; notify provider so the workup can begin; obtain blood cultures (cultures must precede antibiotics or yield drops sharply). Tylenol and breastfeeding are not the priority sequence.',
  '{"subtype":"SENTENCE","slots":[{"id":"s1","target_text":"first action"},{"id":"s2","target_text":"second action"},{"id":"s3","target_text":"third action"}],"tokens":[{"id":"t1","text":"obtain a complete set of vital signs"},{"id":"t2","text":"notify the provider STAT"},{"id":"t3","text":"prepare to obtain blood cultures"},{"id":"t4","text":"administer Tylenol PRN"},{"id":"t5","text":"encourage breastfeeding"}]}'::jsonb,
  '{"slots":{"s1":"t1","s2":"t2","s3":"t3"},"feedback":{"s1":"Full vitals first — provides the data the provider needs.","s2":"Provider notification activates the sepsis workup.","s3":"Cultures must precede antibiotics or yield drops sharply."}}'::jsonb,
  'Fill each slot by choosing the best token from the pool.',
  'Health Promotion and Maintenance','Health Promotion and Maintenance',
  'Maternity','Reproductive','Postpartum complications','Sepsis workflow',
  'Hard','Apply',ARRAY['trend','assessment','drag-drop','sentence','postpartum'],
  FALSE,FALSE,TRUE,1,FALSE,
  'NCLEX_TRD_TEST_T05','TREND_TEST_TUTOR_2026_05_01'
);


-- ─────────────────────────────────────────────────────────
-- Trend 6 (Custom — Pain & Sedation) — Q26–Q30
-- ─────────────────────────────────────────────────────────

-- Q26 — MCQ
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_MCQ_TT26', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'MCQ',
  'These trends are most concerning for which problem?',
  'Falling pain score is reassuring, but RASS dropping to -4 (deep sedation), RR falling to 8, and SpO₂ dropping to 88% are the textbook opioid over-sedation/respiratory depression picture. The pain control "looks good" because the patient is too sedated to respond.',
  '{"options":[{"id":"A","text":"Adequate analgesia"},{"id":"B","text":"Opioid-induced respiratory depression"},{"id":"C","text":"Undertreated pain"},{"id":"D","text":"Opioid withdrawal"}]}'::jsonb,
  '{"answer":"B","feedback":{"A":"Pain control alone does not justify RR 8 and SpO₂ 88%.","B":"Correct. RASS -4 + RR 8 + SpO₂ 88% = opioid over-sedation with respiratory depression.","C":"Pain is dropping, not rising.","D":"Withdrawal causes agitation and tachycardia, not deep sedation."}}'::jsonb,
  'Physiological Integrity','Pharmacological and Parenteral Therapies',
  'Medical-Surgical','Respiratory','Opioid safety','Respiratory depression',
  'Medium','Analyze',ARRAY['trend','custom','opioid','sedation'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T06','TREND_TEST_TUTOR_2026_05_01'
);

-- Q27 — SATA
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_SATA_TT27', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'SATA',
  'Select all priority nursing actions at the 1600 timepoint.',
  'Opioid over-sedation response: stop the opioid (PCA pump), arouse the patient (stimulation), prepare/give naloxone, support respiration. Increasing the dose is the opposite of what is needed.',
  '{"options":[{"id":"A","text":"Stop the PCA pump"},{"id":"B","text":"Stimulate the patient"},{"id":"C","text":"Prepare to administer naloxone"},{"id":"D","text":"Reassess respiratory status"},{"id":"E","text":"Increase the opioid dose"}]}'::jsonb,
  '{"answers":["A","B","C","D"],"feedback":{"A":"Stopping further opioid delivery is the first action.","B":"Arousal stimulation is part of immediate management.","C":"Naloxone reverses opioid respiratory depression.","D":"Continuous reassessment is essential.","E":"Increasing dose worsens respiratory depression."}}'::jsonb,
  'Physiological Integrity','Pharmacological and Parenteral Therapies',
  'Medical-Surgical','Respiratory','Opioid safety','Naloxone use',
  'Medium','Apply',ARRAY['trend','custom','opioid','SATA'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T06','TREND_TEST_TUTOR_2026_05_01'
);

-- Q28 — SELECT_N
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_SELN_TT28', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'SELECT_N',
  'Pick the 2 expected outcomes after naloxone administration.',
  'Naloxone reverses opioid effects: respiratory rate increases and consciousness returns. Sleep, pain relief, and HR change are not the targeted reversal effects.',
  '{"options":[{"id":"A","text":"Increased respiratory rate"},{"id":"B","text":"Increased alertness"},{"id":"C","text":"Improved sleep quality"},{"id":"D","text":"Pain relief"},{"id":"E","text":"Decreased heart rate"}],"select_count":2}'::jsonb,
  '{"answers":["A","B"],"feedback":{"A":"Reversal of opioid-induced respiratory depression.","B":"Reversal of opioid-induced sedation.","C":"Naloxone causes wakefulness, not improved sleep.","D":"Naloxone reverses analgesia — pain often returns.","E":"HR change is not the targeted reversal effect."}}'::jsonb,
  'Physiological Integrity','Pharmacological and Parenteral Therapies',
  'Medical-Surgical','Respiratory','Opioid safety','Naloxone use',
  'Medium','Evaluate',ARRAY['trend','custom','opioid','select-n'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T06','TREND_TEST_TUTOR_2026_05_01'
);

-- Q29 — BOWTIE
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_BT_TT29', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'BOWTIE',
  'Build the bow-tie for the 1600 timepoint.',
  'Opioid-induced respiratory depression response: hold the PCA, give naloxone, monitor respiratory rate and sedation level continuously. Increasing morphine or giving Tylenol misses the urgent issue.',
  '{"left":{"label":"Actions to take","tokens":[{"id":"lt1","text":"Hold the PCA"},{"id":"lt2","text":"Administer naloxone"},{"id":"lt3","text":"Increase morphine bolus"},{"id":"lt4","text":"Administer Tylenol"}]},"centre":{"label":"Condition","tokens":[{"id":"ct1","text":"Opioid-induced respiratory depression"},{"id":"ct2","text":"Uncontrolled pain"},{"id":"ct3","text":"Anxiety"}]},"right":{"label":"Parameters to monitor","tokens":[{"id":"rt1","text":"Respiratory rate"},{"id":"rt2","text":"Sedation level (RASS)"},{"id":"rt3","text":"Urine output"},{"id":"rt4","text":"Dietary intake"}]}}'::jsonb,
  '{"left":["lt1","lt2"],"centre":"ct1","right":["rt1","rt2"],"feedback":{"lt1":"Stops further opioid delivery.","lt2":"Reverses respiratory depression.","lt3":"Worsens the depression.","lt4":"Does not address the urgent respiratory issue.","ct1":"RASS -4, RR 8, SpO₂ 88% on opioid drip = textbook picture.","ct2":"Pain is decreasing, not increasing.","ct3":"Anxiety would cause tachypnea, not bradypnea.","rt1":"Most sensitive marker of opioid depression.","rt2":"RASS tracks reversal response.","rt3":"Not relevant to acute reversal.","rt4":"Not relevant to acute reversal."}}'::jsonb,
  'Physiological Integrity','Pharmacological and Parenteral Therapies',
  'Medical-Surgical','Respiratory','Opioid safety','Bow-tie reasoning',
  'Hard','Apply',ARRAY['trend','custom','opioid','bowtie'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T06','TREND_TEST_TUTOR_2026_05_01'
);

-- Q30 — MATRIX
INSERT INTO nclex_tutor_questions (
  item_id, tutor_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, is_builder_visible,
  marks, shuffle_options,
  trend_id, batch_id
) VALUES (
  'NCLEX_MAT_TT30', '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'MATRIX',
  'For each finding, classify the trend between 0800 and 1600.',
  'Pain score 6 → 0 = improving (analgesia working). RASS 0 → -4 = worsening (over-sedation). RR 18 → 8 = worsening. SpO₂ 97% → 88% = worsening. The decoy is "good pain control" masking respiratory depression.',
  '{"row_label":"Finding","rows":[{"id":"r_pain","text":"Pain score (NRS)"},{"id":"r_rass","text":"RASS"},{"id":"r_rr","text":"Respiratory rate"},{"id":"r_spo2","text":"SpO₂"}],"columns":[{"id":"c_imp","text":"Improving"},{"id":"c_stb","text":"Stable"},{"id":"c_wor","text":"Worsening"}]}'::jsonb,
  '{"cells":{"r_pain":"c_imp","r_rass":"c_wor","r_rr":"c_wor","r_spo2":"c_wor"},"feedback":{"r_pain":"Pain 6 → 0 — analgesia is working (the decoy that masks the danger).","r_rass":"RASS 0 → -4 — deepening sedation, dangerous direction.","r_rr":"RR 18 → 8 — clinically significant respiratory depression.","r_spo2":"SpO₂ 97 → 88 — hypoxic, requires immediate action."}}'::jsonb,
  'Physiological Integrity','Pharmacological and Parenteral Therapies',
  'Medical-Surgical','Respiratory','Opioid safety','Trend interpretation',
  'Medium','Analyze',ARRAY['trend','custom','opioid','matrix'],
  FALSE,FALSE,TRUE,1,TRUE,
  'NCLEX_TRD_TEST_T06','TREND_TEST_TUTOR_2026_05_01'
);


COMMIT;


-- =========================================================
-- VERIFICATION QUERIES (run after the inserts to confirm)
-- =========================================================
--
-- SELECT trend_id, kind, jsonb_array_length(rows) AS row_count,
--        jsonb_array_length(timepoints) AS tp_count
--   FROM nclex_tutor_trend_datasets
--  WHERE trend_id LIKE 'NCLEX_TRD_TEST_T%'
--  ORDER BY trend_id;
--
-- SELECT trend_id, COUNT(*) AS q_count,
--        STRING_AGG(question_type, ', ' ORDER BY item_id) AS types
--   FROM nclex_tutor_questions
--  WHERE batch_id = 'TREND_TEST_TUTOR_2026_05_01'
--  GROUP BY trend_id
--  ORDER BY trend_id;
--
-- Expected:
--   6 trend rows, each with 3-5 timepoints and 0-6 metric rows.
--   30 question rows: 5 per dataset, types as documented above.
