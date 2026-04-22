-- =========================================================
-- MyNclex — Bank seed (DEV-ONLY, SYNTHETIC data)
-- File: mynclex/db/seed-bank-dev.sql
--
-- 8 placeholder MCQ rows tagged batch_id = 'DEV_SEED_001'.
-- NOT real NCLEX content. These exist only to exercise the
-- bank schema, RLS, and future admin/student UIs during
-- development. Replace with real editorial content before
-- shipping to prod.
--
-- To remove later:
--   DELETE FROM nclex_bank_items WHERE batch_id = 'DEV_SEED_001';
-- =========================================================

INSERT INTO nclex_bank_items (
  item_id, question_type, stem, rationale,
  content, correct,
  client_needs_category, client_needs_subcategory,
  nursing_subject, body_system, topic, subtopic,
  difficulty, bloom_level, tags,
  is_published, is_free_sample, marks, batch_id
) VALUES

-- 1. Fall prevention (Safety, Easy)
('NCLEX_MCQ_00001', 'MCQ',
 'A nurse is caring for an older adult client who is confused and attempting to climb out of bed. Which action should the nurse take FIRST?',
 'Before applying restraints, the nurse implements the least restrictive intervention. Staying with the client and removing environmental hazards addresses immediate safety without restricting the client.',
 '{"options":[{"id":"A","text":"Apply soft wrist restraints"},{"id":"B","text":"Stay with the client and remove nearby hazards"},{"id":"C","text":"Administer a prescribed sedative"},{"id":"D","text":"Raise all four side rails"}]}'::jsonb,
 '{"answer":"B","feedback":{"A":"Incorrect. Restraints require a provider order and are a last-resort intervention.","B":"Correct. Staying with the client is the least restrictive safety action and addresses the immediate risk.","C":"Incorrect. Sedation is a chemical restraint and requires an order; not the first action.","D":"Incorrect. Raising all four side rails is considered a restraint in most facilities."}}'::jsonb,
 'Safe and Effective Care Environment', 'Safety and Infection Control',
 'Fundamentals of Nursing', 'Neurological', 'Fall prevention', 'Restraint alternatives',
 'Easy', 'Apply', ARRAY['safety','older-adult','restraints'],
 TRUE, TRUE, 1, 'DEV_SEED_001'),

-- 2. Heparin / aPTT (Pharm, Medium)
('NCLEX_MCQ_00002', 'MCQ',
 'A client receiving a continuous IV heparin infusion has an aPTT of 120 seconds (control 30 seconds). What is the nurse''s priority action?',
 'An aPTT of 120 is well above the therapeutic range (1.5–2.5× control = 45–75 sec). The infusion must be stopped before bleeding occurs.',
 '{"options":[{"id":"A","text":"Continue the infusion and recheck aPTT in 4 hours"},{"id":"B","text":"Stop the heparin infusion and notify the provider"},{"id":"C","text":"Administer vitamin K intramuscularly"},{"id":"D","text":"Increase the heparin infusion rate"}]}'::jsonb,
 '{"answer":"B","feedback":{"A":"Incorrect. The aPTT is supratherapeutic — waiting risks hemorrhage.","B":"Correct. Hold heparin when aPTT is above the therapeutic window and notify the provider for dose adjustment.","C":"Incorrect. Vitamin K reverses warfarin, not heparin. The reversal agent for heparin is protamine sulfate.","D":"Incorrect. Increasing the dose would worsen the already supratherapeutic effect."}}'::jsonb,
 'Physiological Integrity', 'Pharmacological and Parenteral Therapies',
 'Medical-Surgical', 'Hematologic', 'Anticoagulants', 'Heparin monitoring',
 'Medium', 'Analyze', ARRAY['pharmacology','anticoagulants','lab-values'],
 TRUE, FALSE, 1, 'DEV_SEED_001'),

-- 3. Hand hygiene — C. difficile (Infection Control, Easy)
('NCLEX_MCQ_00003', 'MCQ',
 'A nurse is about to care for a client with Clostridioides difficile infection. Which hand hygiene method is MOST appropriate?',
 'Alcohol-based hand rubs do not kill C. difficile spores. Soap-and-water handwashing mechanically removes spores.',
 '{"options":[{"id":"A","text":"Alcohol-based hand rub for 15 seconds"},{"id":"B","text":"Alcohol-based hand rub for 30 seconds"},{"id":"C","text":"Soap and water for at least 20 seconds"},{"id":"D","text":"Antiseptic wipes only"}]}'::jsonb,
 '{"answer":"C","feedback":{"A":"Incorrect. Alcohol does not kill C. difficile spores.","B":"Incorrect. Longer exposure does not change alcohol''s ineffectiveness against spores.","C":"Correct. Soap-and-water handwashing is required to mechanically remove C. difficile spores.","D":"Incorrect. Antiseptic wipes alone do not provide adequate mechanical cleansing."}}'::jsonb,
 'Safe and Effective Care Environment', 'Safety and Infection Control',
 'Fundamentals of Nursing', 'Gastrointestinal', 'Infection control', 'Transmission-based precautions',
 'Easy', 'Remember', ARRAY['infection-control','isolation','c-diff'],
 TRUE, TRUE, 1, 'DEV_SEED_001'),

-- 4. Postpartum fundus (Maternity, Medium)
('NCLEX_MCQ_00004', 'MCQ',
 'Two hours after a vaginal delivery, a nurse assesses the client''s fundus and finds it boggy and displaced to the right of the umbilicus. What should the nurse do FIRST?',
 'A boggy fundus suggests uterine atony; displacement to the right suggests a full bladder. Emptying the bladder often allows the uterus to contract.',
 '{"options":[{"id":"A","text":"Begin vigorous fundal massage immediately"},{"id":"B","text":"Assist the client to void"},{"id":"C","text":"Administer oxytocin per protocol"},{"id":"D","text":"Notify the provider"}]}'::jsonb,
 '{"answer":"B","feedback":{"A":"Incorrect. Fundal massage alone will not correct bladder-related displacement.","B":"Correct. A full bladder displaces the uterus and prevents effective contraction; have the client void first.","C":"Incorrect. Oxytocin may be indicated later; first address the reversible cause.","D":"Incorrect. The nurse can act independently on this assessment finding before notifying the provider."}}'::jsonb,
 'Health Promotion and Maintenance', 'Health Promotion and Maintenance',
 'Maternity', 'Reproductive', 'Postpartum assessment', 'Uterine atony',
 'Medium', 'Analyze', ARRAY['maternity','postpartum','atony'],
 TRUE, FALSE, 1, 'DEV_SEED_001'),

-- 5. Therapeutic communication — grief (Psychosocial, Medium)
('NCLEX_MCQ_00005', 'MCQ',
 'A client whose spouse died one week ago tells the nurse, "I can''t believe this is happening. There must have been something more I could have done." Which response by the nurse is MOST therapeutic?',
 'Reflective, open-ended responses acknowledge feelings without reassurance or closure. Denial and guilt are normal in early grief.',
 '{"options":[{"id":"A","text":"You did everything you could. Don''t blame yourself."},{"id":"B","text":"It sounds like you are feeling guilty about your spouse''s death."},{"id":"C","text":"Time heals all wounds — it will get easier."},{"id":"D","text":"Would you like me to call the chaplain?"}]}'::jsonb,
 '{"answer":"B","feedback":{"A":"Incorrect. Reassurance blocks further expression of feelings.","B":"Correct. Reflecting the client''s feelings invites them to explore their grief.","C":"Incorrect. Clichés minimize the client''s experience.","D":"Incorrect. Redirecting to another provider blocks the therapeutic moment."}}'::jsonb,
 'Psychosocial Integrity', 'Psychosocial Integrity',
 'Mental Health', NULL, 'Grief and loss', 'Therapeutic communication',
 'Medium', 'Apply', ARRAY['communication','grief','mental-health'],
 TRUE, FALSE, 1, 'DEV_SEED_001'),

-- 6. NG tube placement (Basic Care, Medium)
('NCLEX_MCQ_00006', 'MCQ',
 'Which method is the GOLD STANDARD for verifying initial placement of a newly inserted nasogastric (NG) tube?',
 'Radiographic (X-ray) confirmation is the evidence-based standard for initial NG placement. Auscultation of air is no longer recommended.',
 '{"options":[{"id":"A","text":"Auscultate for air over the epigastric area"},{"id":"B","text":"Obtain a chest/abdominal X-ray"},{"id":"C","text":"Check gastric pH of aspirate"},{"id":"D","text":"Ask the client to swallow water"}]}'::jsonb,
 '{"answer":"B","feedback":{"A":"Incorrect. Auscultation is unreliable — air can be heard even with tubes in the lung.","B":"Correct. X-ray is the gold standard for verifying initial NG tube placement.","C":"Incorrect. pH testing is useful for ongoing verification but not the initial confirmation standard.","D":"Incorrect. Swallowing water is a distracting maneuver, not a placement verification."}}'::jsonb,
 'Physiological Integrity', 'Basic Care and Comfort',
 'Medical-Surgical', 'Gastrointestinal', 'Enteral nutrition', 'NG tube verification',
 'Medium', 'Remember', ARRAY['gi','procedures','tube-feeding'],
 TRUE, FALSE, 1, 'DEV_SEED_001'),

-- 7. Acute MI — aspirin priority (Physiological Adaptation, Hard)
('NCLEX_MCQ_00007', 'MCQ',
 'A client presents to the emergency department with crushing substernal chest pain radiating to the left arm. ECG shows ST-segment elevation in leads II, III, and aVF. Which medication should the nurse anticipate giving FIRST?',
 'For suspected acute MI, chewable aspirin 160–325 mg is given as soon as possible for its antiplatelet effect (MONA: Morphine, Oxygen, Nitrates, Aspirin — aspirin is prioritized early).',
 '{"options":[{"id":"A","text":"IV morphine 4 mg"},{"id":"B","text":"Sublingual nitroglycerin 0.4 mg"},{"id":"C","text":"Aspirin 325 mg chewable"},{"id":"D","text":"IV metoprolol 5 mg"}]}'::jsonb,
 '{"answer":"C","feedback":{"A":"Incorrect. Morphine is for pain not relieved by nitrates; aspirin is prioritized for its antiplatelet effect.","B":"Incorrect. Nitroglycerin is given after aspirin; aspirin''s antiplatelet effect is time-critical.","C":"Correct. Chewable aspirin is given as early as possible in suspected MI to inhibit platelet aggregation.","D":"Incorrect. Beta-blockers may be given later; aspirin is first-line."}}'::jsonb,
 'Physiological Integrity', 'Physiological Adaptation',
 'Medical-Surgical', 'Cardiovascular', 'Acute coronary syndrome', 'Inferior wall MI',
 'Hard', 'Analyze', ARRAY['cardiac','emergency','ACS'],
 TRUE, FALSE, 1, 'DEV_SEED_001'),

-- 8. Diabetes teaching — evaluation (Health Promotion, Medium)
('NCLEX_MCQ_00008', 'MCQ',
 'A nurse is teaching a client newly diagnosed with type 1 diabetes about insulin administration. Which statement by the client indicates a NEED FOR FURTHER TEACHING?',
 'Insulin should never be injected through clothing — cleanliness and proper site assessment are lost. The other statements reflect correct self-care.',
 '{"options":[{"id":"A","text":"I will rotate my injection sites within the same area before moving to another area."},{"id":"B","text":"I can inject insulin through my shirt when I am in a hurry."},{"id":"C","text":"I will check my blood sugar before meals and at bedtime."},{"id":"D","text":"I will keep a source of fast-acting sugar with me at all times."}]}'::jsonb,
 '{"answer":"B","feedback":{"A":"Correct statement. Site rotation within one area, then moving to a new area, reduces lipohypertrophy.","B":"Indicates a teaching need — this is the answer. Insulin should never be injected through clothing.","C":"Correct statement. Pre-meal and bedtime glucose checks are standard.","D":"Correct statement. Fast-acting carbohydrate is essential for hypoglycemia management."}}'::jsonb,
 'Health Promotion and Maintenance', 'Health Promotion and Maintenance',
 'Medical-Surgical', 'Endocrine', 'Diabetes mellitus', 'Insulin self-administration',
 'Medium', 'Evaluate', ARRAY['endocrine','diabetes','patient-teaching'],
 TRUE, FALSE, 1, 'DEV_SEED_001'),

-- 9. Matrix — Finding triage (Clinical judgement, Medium)
('NCLEX_MAT_00001', 'MATRIX',
 'For each assessment finding below, indicate whether the nurse should Report to the provider, Monitor, or Ignore.',
 'Prioritisation requires separating shock (unstable vitals) from minor findings. Escalate unstable vitals; monitor borderline values; take no action on resolving findings.',
 '{"row_label":"Finding","rows":[{"id":"r1","text":"BP 88/52, HR 122, diaphoretic"},{"id":"r2","text":"Temp 37.4°C orally, otherwise stable"},{"id":"r3","text":"Bruise on elbow, resolving, non-tender"}],"columns":[{"id":"c1","text":"Report"},{"id":"c2","text":"Monitor"},{"id":"c3","text":"Ignore"}]}'::jsonb,
 '{"cells":{"r1":"c1","r2":"c2","r3":"c3"},"feedback":{"r1":"Hypotension with tachycardia and diaphoresis suggests shock — escalate immediately.","r2":"Borderline temp; continue to monitor but no immediate action.","r3":"Resolving, non-tender — no intervention needed."}}'::jsonb,
 'Physiological Integrity', 'Reduction of Risk Potential',
 'Medical-Surgical', 'Cardiovascular', 'Shock recognition', 'Prioritisation',
 'Medium', 'Analyze', ARRAY['NGN','matrix','prioritisation'],
 TRUE, FALSE, 1, 'DEV_SEED_001'),

-- 10. Bow-tie — Inferior wall MI (Cardiac, Medium)
('NCLEX_BT_00001', 'BOWTIE',
 'A 72-year-old female presents with chest pain radiating to the left jaw, diaphoresis, BP 90/58, HR 108. ECG shows ST elevation in leads II, III, aVF. Complete the bow-tie.',
 'ST elevation in II, III, aVF diagnoses inferior wall MI. Immediate priorities are antiplatelet therapy and oxygen delivery. Continuous rhythm and pain monitoring guide management.',
 '{"left":{"label":"Actions to take","tokens":[{"id":"lt1","text":"Give aspirin 325 mg"},{"id":"lt2","text":"Apply oxygen"},{"id":"lt3","text":"Start NG tube"},{"id":"lt4","text":"Administer warfarin"}]},"centre":{"label":"Condition","tokens":[{"id":"ct1","text":"Inferior wall MI"},{"id":"ct2","text":"Pulmonary embolism"},{"id":"ct3","text":"Anxiety attack"}]},"right":{"label":"Parameters to monitor","tokens":[{"id":"rt1","text":"Cardiac rhythm"},{"id":"rt2","text":"Pain level"},{"id":"rt3","text":"Temperature"},{"id":"rt4","text":"Bowel sounds"}]}}'::jsonb,
 '{"left":["lt1","lt2"],"centre":"ct1","right":["rt1","rt2"],"feedback":{"lt1":"Antiplatelet therapy reduces clot extension in acute MI.","lt2":"Maintains oxygenation to ischaemic myocardium.","lt3":"Not indicated in acute MI without GI bleed.","ct1":"ST elevation in II, III, aVF indicates RCA territory ischaemia.","ct2":"PE causes pleuritic pain, not ST elevation in inferior leads.","rt1":"Arrhythmias common post-MI; continuous monitoring essential.","rt2":"Guides analgesia and indicates ischaemia reduction."}}'::jsonb,
 'Physiological Integrity', 'Physiological Adaptation',
 'Medical-Surgical', 'Cardiovascular', 'Acute coronary syndrome', 'STEMI recognition',
 'Medium', 'Analyze', ARRAY['NGN','bowtie','cardiac','STEMI'],
 TRUE, FALSE, 1, 'DEV_SEED_001'),

-- 11. Cloze — Heart failure presentation (Cardiac, Medium)
('NCLEX_CLZ_00001', 'CLOZE',
 'The client is most likely experiencing {1} as evidenced by {2} and {3}.',
 'Classic HF picture — elevated BNP plus bilateral crackles plus dyspnoea. PE and pneumonia can mimic individual findings but not the full combination.',
 '{"blanks":[{"id":"b1","choices":[{"id":"c1","text":"heart failure"},{"id":"c2","text":"pulmonary embolism"},{"id":"c3","text":"pneumonia"}]},{"id":"b2","choices":[{"id":"c1","text":"elevated BNP"},{"id":"c2","text":"elevated troponin"},{"id":"c3","text":"elevated WBC"}]},{"id":"b3","choices":[{"id":"c1","text":"crackles"},{"id":"c2","text":"wheezing"},{"id":"c3","text":"stridor"}]}]}'::jsonb,
 '{"answers":{"b1":"c1","b2":"c1","b3":"c1"},"feedback":{"b1":{"c1":"Elevated BNP plus bilateral crackles strongly suggests HF exacerbation.","c2":"PE typically presents with pleuritic chest pain and hypoxia; BNP rarely elevated enough to mislead.","c3":"Pneumonia can cause crackles but BNP elevation is atypical."},"b2":{"c1":"BNP above 400 suggests ventricular stretch from volume overload.","c2":"Troponin indicates myocardial injury, not HF specifically.","c3":"WBC elevation suggests infection, not HF."},"b3":{"c1":"Bilateral crackles reflect pulmonary oedema from elevated left-sided pressures.","c2":"Wheezing is more typical of bronchospasm or asthma.","c3":"Stridor indicates upper airway obstruction."}}}'::jsonb,
 'Physiological Integrity', 'Physiological Adaptation',
 'Medical-Surgical', 'Cardiovascular', 'Heart failure', 'Clinical presentation',
 'Medium', 'Analyze', ARRAY['NGN','cloze','cardiac','HF'],
 TRUE, FALSE, 1, 'DEV_SEED_001');
