-- mynclex/db/seed-tutor-bank-dev.sql
--
-- Slice 2.1 — four Family A tutor-private questions, one per type.
-- Bound to Sam's dev tutor account
-- (mybackpacc+mynclextutor@gmail.com, UUID 4ed777d7-e4f7-403b-88f4-63ce5432d65e).
--
-- Applied to dev via Supabase MCP apply_migration; not intended for
-- prod (these are test drafts, not QAcademy content).

INSERT INTO nclex_tutor_questions (
  item_id,
  tutor_id,
  question_type,
  stem,
  rationale,
  content,
  correct,
  client_needs_category,
  client_needs_subcategory,
  nursing_subject,
  body_system,
  difficulty,
  is_published,
  instruction
)
VALUES
  (
    'NCLEX_TUT_MCQ_00001',
    '4ed777d7-e4f7-403b-88f4-63ce5432d65e'::uuid,
    'MCQ',
    'Which assessment finding is most concerning in a client admitted with acute heart failure?',
    'New-onset bilateral crackles reflect worsening pulmonary oedema — the hallmark of decompensated heart failure. Mild pedal oedema is expected and does not trigger immediate escalation; RR 18 and BP 132/80 are both within target ranges.',
    '{"options":[
      {"id":"o1","text":"Bilateral crackles in both lower lung fields"},
      {"id":"o2","text":"Mild pedal oedema"},
      {"id":"o3","text":"Respiratory rate of 18"},
      {"id":"o4","text":"Blood pressure 132/80 mmHg"}
    ]}'::jsonb,
    '{"answer":"o1","feedback":{
      "o1":"Correct — crackles indicate pulmonary fluid overload.",
      "o2":"Expected in heart failure; monitor but not urgent.",
      "o3":"Within normal limits.",
      "o4":"Acceptable BP range for most HF clients."
    }}'::jsonb,
    'Physiological Integrity',
    'Physiological Adaptation',
    'Medical-Surgical',
    'Cardiovascular',
    'Medium',
    FALSE,
    NULL
  ),
  (
    'NCLEX_TUT_TF_00001',
    '4ed777d7-e4f7-403b-88f4-63ce5432d65e'::uuid,
    'TF',
    'Administering nitroglycerin sublingually lowers preload and can relieve chest pain associated with angina.',
    'Nitroglycerin dilates veins, reducing preload and myocardial oxygen demand. This is its primary mechanism in angina relief.',
    '{"options":[
      {"id":"true","text":"True"},
      {"id":"false","text":"False"}
    ]}'::jsonb,
    '{"answer":"true","feedback":{
      "true":"Correct — preload reduction is the key mechanism.",
      "false":"Incorrect — preload reduction is exactly how nitroglycerin works."
    }}'::jsonb,
    'Physiological Integrity',
    'Pharmacological and Parenteral Therapies',
    'Pharmacology',
    'Cardiovascular',
    'Easy',
    FALSE,
    NULL
  ),
  (
    'NCLEX_TUT_SATA_00001',
    '4ed777d7-e4f7-403b-88f4-63ce5432d65e'::uuid,
    'SATA',
    'Which findings are associated with hypokalaemia? Select all that apply.',
    'Hypokalaemia impairs smooth and cardiac muscle function. Classic findings include muscle weakness, cramping, a flattened T-wave on ECG, and reduced bowel motility leading to constipation or ileus.',
    '{"options":[
      {"id":"o1","text":"Muscle weakness"},
      {"id":"o2","text":"Flattened T-wave on ECG"},
      {"id":"o3","text":"Hyperactive bowel sounds"},
      {"id":"o4","text":"Constipation"},
      {"id":"o5","text":"Peaked T-wave on ECG"}
    ]}'::jsonb,
    '{"answers":["o1","o2","o4"],"feedback":{
      "o1":"Correct — low K⁺ causes skeletal muscle weakness.",
      "o2":"Correct — classic hypokalaemia ECG change.",
      "o3":"Incorrect — hypokalaemia slows bowel motility.",
      "o4":"Correct — reduced peristalsis → constipation.",
      "o5":"Incorrect — peaked T-waves indicate hyperkalaemia."
    }}'::jsonb,
    'Physiological Integrity',
    'Physiological Adaptation',
    'Medical-Surgical',
    'Multisystem',
    'Medium',
    FALSE,
    'Select ALL that apply.'
  ),
  (
    'NCLEX_TUT_SN_00001',
    '4ed777d7-e4f7-403b-88f4-63ce5432d65e'::uuid,
    'SELECT_N',
    'A client newly diagnosed with type 2 diabetes asks about lifestyle measures. Select the TWO most important teaching points for glycaemic control.',
    'Consistent carbohydrate intake and regular moderate-intensity aerobic activity are the two evidence-based lifestyle measures with the largest impact on HbA1c. Daily weighing, limiting all fats, and doubling water intake are either unhelpful or incorrect advice.',
    '{"select_count":2,"options":[
      {"id":"o1","text":"Eat consistent carbohydrate amounts at each meal"},
      {"id":"o2","text":"Weigh yourself at the same time every day"},
      {"id":"o3","text":"Engage in 150 minutes of moderate aerobic activity per week"},
      {"id":"o4","text":"Eliminate all dietary fat"},
      {"id":"o5","text":"Double your daily water intake"}
    ]}'::jsonb,
    '{"answers":["o1","o3"],"feedback":{
      "o1":"Correct — consistent carb intake stabilises glucose.",
      "o2":"Useful for weight monitoring but not the top priority here.",
      "o3":"Correct — aerobic activity improves insulin sensitivity.",
      "o4":"Incorrect — healthy fats are part of a balanced diet.",
      "o5":"Incorrect — excess water intake isn''t a diabetes measure."
    }}'::jsonb,
    'Health Promotion and Maintenance',
    'Health Promotion and Maintenance',
    'Medical-Surgical',
    'Endocrine',
    'Medium',
    FALSE,
    NULL
  );
