-- db/seed/pitch/01-flagship-programme.sql
--
-- The flagship pitch programme: "NCLEX-RN Live — The 8-Week Pass Plan".
-- Built to be shown to prospective tutors on dev, so every activity a
-- tutor clicks opens something real: the 27 library notes rewritten in
-- 02-library-notes.sql, the five shelves, the seven published tutor
-- quizzes, and a READY PDF asset already on dev.
--
-- Tutor: 4ed777d7-e4f7-403b-88f4-63ce5432d65e (mybackpacc+mynclextutor@gmail.com)
--
-- Shape: 8 weekly units, each with the same three-block rhythm —
--   Before class  ->  Live class  ->  After class
-- which is the pre/post tutorial structure a tutor recognises as their
-- own working week. All eight activity types appear at least once, so
-- the pitch shows the whole toolkit and not just text.
--
-- Deterministic UUIDs so the file is re-runnable:
--   50…  programme      51…  units        52…  blocks
--   53…  activities     54…  note/shelf attachments
--   56…  cohorts        57…  live-session planner rows
--   58…  payment strategies
-- (55… is the library notes, minted in 02-library-notes.sql.)
--
-- The 53…/54… suffix encodes position: WWWWBBBBOOOO (week, block,
-- ordinal), so an id read off a screen says where it sits.
--
-- Idempotent: every INSERT carries ON CONFLICT DO UPDATE / DO NOTHING.
-- Cohort dates are relative to CURRENT_DATE, so a re-run re-freshens
-- the demo (one cohort mid-run, one still upcoming).

BEGIN;

-- =====================================================================
-- 1. Programme
-- =====================================================================

INSERT INTO nclex_programmes (
  programme_id, tutor_id, title, tagline, description,
  delivery_mode, unit_label, length_units,
  price_currency, show_price_publicly, payment_collection_mode,
  access_window_days, payment_gates_access,
  status, published_at
) VALUES (
  '50000000-0000-4000-8000-000000000001',
  '4ed777d7-e4f7-403b-88f4-63ce5432d65e',
  'NCLEX-RN Live — The 8-Week Pass Plan',
  'Eight weeks, a live class every week, and a mock every fortnight — built for nurses working full shifts.',
  E'This is the programme I run for nurses who are working, often on rotating shifts, and cannot give up their evenings indefinitely. Eight weeks, one live class a week, and a structure that tells you exactly what to do before and after each session.\n\nEvery week follows the same rhythm. Before class you read two or three short notes — the ones that carry the reasoning, not the trivia. In class we work through questions live, out loud, so you hear how a decision gets made. After class you drill it, and I see your results before we meet again.\n\nThe eight weeks cover the NCLEX-RN test plan in the order that builds: how the exam actually decides, then Management of Care, Safety and Infection Control, Pharmacology across two weeks, Physiological Adaptation, Health Promotion, and finally Psychosocial Integrity alongside your test-day plan.\n\nWho this is for: nurses preparing for US, UK or Canadian licensure, including first-time candidates and retakers. You do not need to have started studying. You do need to be able to attend the live sessions or watch the recordings within the week.',
  'TUTOR_LED', 'WEEK', 8,
  'GHS', TRUE, 'ON_PLATFORM',
  NULL, TRUE,
  'PUBLISHED', NOW()
)
ON CONFLICT (programme_id) DO UPDATE SET
  title = EXCLUDED.title, tagline = EXCLUDED.tagline,
  description = EXCLUDED.description, delivery_mode = EXCLUDED.delivery_mode,
  unit_label = EXCLUDED.unit_label, length_units = EXCLUDED.length_units,
  price_currency = EXCLUDED.price_currency,
  payment_collection_mode = EXCLUDED.payment_collection_mode,
  status = EXCLUDED.status, updated_at = NOW();


-- =====================================================================
-- 2. Payment strategies — three plans, programme-level (cohort_id NULL)
-- =====================================================================
-- Instalments are the plan Ghanaian tutors ask about first, so all
-- three kinds are represented. Amounts are integer MINOR units
-- (GHS 4,500 = 450000) per lib/products/money.ts.

INSERT INTO nclex_programme_payment_strategies (
  strategy_id, programme_id, kind, label,
  total_price_minor, initial_price_minor,
  installment_count, installment_interval_days,
  balance_due_days_after_enrolment, is_active, sort_order
) VALUES
  ('58000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-000000000001',
   'UPFRONT_FULL', 'Pay in full',
   450000, 450000, NULL, NULL, NULL, TRUE, 1),

  ('58000000-0000-4000-8000-000000000002',
   '50000000-0000-4000-8000-000000000001',
   'DEPOSIT_BALANCE', 'Deposit now, balance in 30 days',
   480000, 150000, NULL, NULL, 30, TRUE, 2),

  ('58000000-0000-4000-8000-000000000003',
   '50000000-0000-4000-8000-000000000001',
   'EQUAL_INSTALLMENTS', '4 monthly payments',
   500000, 125000, 4, 30, NULL, TRUE, 3)
ON CONFLICT (strategy_id) DO UPDATE SET
  kind = EXCLUDED.kind, label = EXCLUDED.label,
  total_price_minor = EXCLUDED.total_price_minor,
  initial_price_minor = EXCLUDED.initial_price_minor,
  installment_count = EXCLUDED.installment_count,
  installment_interval_days = EXCLUDED.installment_interval_days,
  balance_due_days_after_enrolment = EXCLUDED.balance_due_days_after_enrolment,
  is_active = TRUE, sort_order = EXCLUDED.sort_order, updated_at = NOW();


-- =====================================================================
-- 3. Units — 8 weeks
-- =====================================================================
-- The AFTER INSERT trigger nclex_programmes_seed_units_trg has just
-- created eight BLANK units with random ids (it seeds 1..length_units
-- on every programme insert). They would collide with ours on the
-- (programme_id, unit_index) unique constraint, so drop them first —
-- everything downstream needs unit ids it can predict.
--
-- On a re-run there is nothing to drop: the programme INSERT above hit
-- ON CONFLICT, so the trigger never fired, and the only units present
-- are the eight 51…-prefixed rows this file owns.

DELETE FROM nclex_programme_units
WHERE  programme_id = '50000000-0000-4000-8000-000000000001'
  AND  unit_id::text NOT LIKE '51000000-0000-4000-8000-%';

INSERT INTO nclex_programme_units (unit_id, programme_id, unit_index, title, description, is_published)
VALUES
  ('51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',1,
   'How the exam thinks',
   'Before any content: understand the machine you are sitting in front of, and the two frameworks that decide a large share of your answers.',TRUE),
  ('51000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',2,
   'Management of Care',
   'The largest single category on the test plan. Delegation, scope of practice, prioritisation, and the legal-ethical questions that come with them.',TRUE),
  ('51000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000001',3,
   'Safety and Infection Control',
   'Isolation precautions, error prevention, and the room-assignment question that appears on almost every exam.',TRUE),
  ('51000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000001',4,
   'Pharmacology I — principles and calculations',
   'Dosage calculation, high-alert drugs, and the four drug families the exam returns to again and again.',TRUE),
  ('51000000-0000-4000-8000-000000000005','50000000-0000-4000-8000-000000000001',5,
   'Pharmacology II and Reduction of Risk',
   'Lab values, ABGs and diagnostics — reading a number and knowing what it changes about your next action.',TRUE),
  ('51000000-0000-4000-8000-000000000006','50000000-0000-4000-8000-000000000001',6,
   'Physiological Adaptation',
   'Cardiac, respiratory, renal and endocrine emergencies. The heaviest content week of the programme.',TRUE),
  ('51000000-0000-4000-8000-000000000007','50000000-0000-4000-8000-000000000001',7,
   'Health Promotion and Maintenance',
   'Maternal, newborn and paediatric care, plus the health-promotion items that sit alongside them.',TRUE),
  ('51000000-0000-4000-8000-000000000008','50000000-0000-4000-8000-000000000001',8,
   'Psychosocial Integrity and test readiness',
   'Therapeutic communication, mental-health safety — and everything you need in place before test day.',TRUE)
ON CONFLICT (unit_id) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  is_published = TRUE, updated_at = NOW();


-- =====================================================================
-- 4. Blocks — the same three-block rhythm in every week
-- =====================================================================

INSERT INTO nclex_programme_blocks (block_id, unit_id, cohort_id, ordinal, title, description, is_published)
SELECT
  ('52000000-0000-4000-8000-' || lpad(w::text,4,'0') || lpad(b::text,4,'0') || '0000')::uuid,
  ('51000000-0000-4000-8000-' || lpad(w::text,12,'0'))::uuid,
  NULL, b,
  CASE b WHEN 1 THEN 'Before class' WHEN 2 THEN 'Live class' ELSE 'After class' END,
  CASE b
    WHEN 1 THEN 'Read these before we meet. Twenty to thirty minutes — do not skip it, the live session assumes you have.'
    WHEN 2 THEN 'The live session. Recordings are posted the same evening if you cannot attend.'
    ELSE 'Consolidate. Drill it while it is still fresh — this is where the marks actually move.'
  END,
  TRUE
FROM generate_series(1,8) w, generate_series(1,3) b
ON CONFLICT (block_id) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  is_published = TRUE, updated_at = NOW();


-- =====================================================================
-- 5. Activities — 45 leaves across the 24 blocks
-- =====================================================================
-- (w, b, o) is week / block / ordinal; the id is derived from it.
-- LIBRARY_NOTE and SHELF carry an EMPTY payload by design — the
-- pointer lives in the attachment row (section 6), per slices 11.11
-- and 11.12. MOCK and PRACTICE_QUIZ point at the seven PUBLISHED tutor
-- quizzes already on dev; PDF points at a READY nclex_media_assets row.

INSERT INTO nclex_programme_activities (
  activity_id, unit_id, block_id, cohort_id, ordinal,
  type, title, description, note, payload, is_published
)
SELECT
  ('53000000-0000-4000-8000-' || lpad(v.w::text,4,'0') || lpad(v.b::text,4,'0') || lpad(v.o::text,4,'0'))::uuid,
  ('51000000-0000-4000-8000-' || lpad(v.w::text,12,'0'))::uuid,
  ('52000000-0000-4000-8000-' || lpad(v.w::text,4,'0') || lpad(v.b::text,4,'0') || '0000')::uuid,
  NULL, v.o, v.type, v.title, v.description, v.note, v.payload::jsonb, TRUE
FROM (VALUES

  -- ---- Week 1 — How the exam thinks -------------------------------
  (1,1,1,'TEXT','Start here — how this programme works',
   'What the eight weeks look like, what I expect of you each week, and how to get help between sessions.',
   'Read this once, properly. Five minutes now saves you a fortnight of guessing.',
   '{"body":"Welcome. Before anything else, here is how the next eight weeks run.\n\nEvery week has the same three parts, and they are in the order you should do them.\n\nBEFORE CLASS. Two or three short notes, twenty to thirty minutes. These are not optional reading — the live session starts from the assumption that you have read them, and if you have not, you will spend the class catching up instead of thinking.\n\nLIVE CLASS. Ninety minutes, once a week. We work through questions out loud. You will hear me change my mind mid-question, and that is the point: I want you to hear how the decision actually gets made, not just which letter was right.\n\nAFTER CLASS. A quiz or a mock. This is where the marks move. Do it within two days of the class while the reasoning is still warm — not the night before the next session.\n\nWHAT I EXPECT. Attend live if you can. If you cannot, watch the recording before the next session — it is posted the same evening. Do the after-class quiz every week without exception; I look at the results before we next meet, and I plan the class around what the group got wrong.\n\nIF YOU FALL BEHIND. Tell me. Do not quietly skip a week and hope to catch up in week six — you will not. Message me and we will decide together what to drop.\n\nONE LAST THING. This programme is eight weeks because that is how long it takes to build the reasoning, not because eight is a round number. Trust the order.","estimated_minutes":5}'),
  (1,1,2,'LIBRARY_NOTE','Why the length of your exam tells you nothing',
   'How computerised adaptive testing actually decides, and why the number of questions you sat is not a signal.',
   'The single most common thing candidates get wrong about their own exam. Read it before class.', '{}'),
  (1,1,3,'LIBRARY_NOTE','Maslow''s hierarchy on NCLEX',
   'Where Maslow genuinely applies on the exam, and the far more common case where ABC overrides it.',
   NULL, '{}'),
  (1,1,4,'SHELF','Week 1 essentials',
   'The six reference notes you will come back to all eight weeks. Skim them now; you are not expected to memorise them yet.',
   'Skim, do not study. You will return to these constantly.', '{}'),

  (1,2,1,'ONLINE_LIVE_SESSION','Week 1 live — how the exam decides',
   'We sit a handful of questions together and I show you, live, what the algorithm is doing behind each one.',
   'Bring a pen. We do the first questions together on screen.',
   '{"typical_duration_minutes":90}'),

  (1,3,1,'PRACTICE_QUIZ','Fundamentals quick quiz',
   'A short untimed set to establish where you are starting from. Your score here is a baseline, not a verdict.',
   'Do this within two days of the live class. Untimed — think, do not rush.',
   '{"quiz_id":"f99feeae-3339-4534-96bd-ede4beeeee31"}'),

  -- ---- Week 2 — Management of Care --------------------------------
  (2,1,1,'LIBRARY_NOTE','Delegation: who can do what',
   'The scope boundaries for RN, LPN/LVN and UAP, and the five rights of delegation the exam tests through scenarios.',
   'Learn the boundaries cold. Delegation questions are free marks once you do.', '{}'),
  (2,1,2,'LIBRARY_NOTE','ABC priority hierarchy',
   'Airway, breathing, circulation — and the exceptions where it does not apply.',
   NULL, '{}'),
  (2,1,3,'SHELF','Foundational SATA pack',
   'Four notes on the question formats that punish guessing hardest. Read alongside the delegation note.',
   NULL, '{}'),

  (2,2,1,'ONLINE_LIVE_SESSION','Week 2 live — delegation and prioritisation',
   'Management of Care is the biggest slice of the test plan. We spend the whole session on who does what, and who you see first.',
   NULL,
   '{"typical_duration_minutes":90}'),

  (2,3,1,'PRACTICE_QUIZ','Quick med-surg drill',
   'Prioritisation under mild pressure. Untimed, but do it in one sitting.',
   'One sitting, no notes open. You are testing recall, not reading speed.',
   '{"quiz_id":"2f6a604d-5cf9-48d0-9bf1-dbad4d66c3fa"}'),
  (2,3,2,'EXTERNAL_LINK','NCSBN — the clinical judgment model',
   'The regulator''s own decision framework, in their words. Worth ten minutes so you have seen the source, not just my summary.',
   'Optional, but recommended if delegation is where you lose marks.',
   '{"url":"https://www.ncsbn.org/public-files/NGD_ClinicalJudgmentModel_Summary.pdf","estimated_minutes":10}'),

  -- ---- Week 3 — Safety and Infection Control ----------------------
  (3,1,1,'LIBRARY_NOTE','Standard, contact, droplet, airborne',
   'The four precaution levels, the equipment each one needs, and the conditions that sit under each.',
   'The room-assignment question comes straight out of this note. Know it.', '{}'),
  (3,1,2,'LIBRARY_NOTE','Select-all-that-apply strategy',
   'How to work a SATA item option-by-option instead of gambling on the set as a whole.',
   NULL, '{}'),

  (3,2,1,'ONLINE_LIVE_SESSION','Week 3 live — precautions and the room assignment',
   'Who can share a room with whom, and why. We work the classic four-patient assignment question from scratch.',
   NULL,
   '{"typical_duration_minutes":90}'),

  (3,3,1,'MOCK','Safety and infection control mock',
   'Your first timed, sequential mock. You cannot go back — same as the real thing.',
   'Timed and sequential: no going back. Sit it in one uninterrupted block.',
   '{"quiz_id":"a5e394bf-c664-4ad6-a9d8-c46ce6b8fee5"}'),

  -- ---- Week 4 — Pharmacology I ------------------------------------
  (4,1,1,'LIBRARY_NOTE','Dosage calculation: the three formulas',
   'Desired-over-have, dimensional analysis, and weight-based paediatric dosing — with the unit conversions that cause most errors.',
   'Work the examples with a pen and paper before class, not just your eyes.', '{}'),
  (4,1,2,'SHELF','Drug deep dives',
   'Four drug families the exam returns to relentlessly: beta blockers, loop diuretics, anticoagulants and insulin.',
   NULL, '{}'),

  (4,2,1,'ONLINE_LIVE_SESSION','Week 4 live — calculations, worked out loud',
   'I work calculations on screen at exam pace, including the ones where the units are the trap.',
   'Have a calculator and paper ready. You will be working alongside me.',
   '{"typical_duration_minutes":90}'),

  (4,3,1,'MOCK','Pharmacology mock exam',
   'Timed, free navigation — you can flag and come back, so practise managing the clock.',
   'Flag what you are unsure of and return to it. Learning to move on is half the skill.',
   '{"quiz_id":"aebe5044-27dc-46f0-8819-63642894da10"}'),

  -- ---- Week 5 — Pharmacology II and Reduction of Risk -------------
  (5,1,1,'LIBRARY_NOTE','Quick reference: lab values',
   'The values worth memorising, and the critical thresholds that change your next action.',
   'Memorise the critical values. The normals you can reason toward; the criticals you cannot.', '{}'),
  (5,1,2,'LIBRARY_NOTE','ABG interpretation',
   'A repeatable four-step method for acid-base, including compensation.',
   NULL, '{}'),
  (5,1,3,'SHELF','Renal foundational',
   'Renal reference reading to sit alongside the lab-value work.',
   NULL, '{}'),

  (5,2,1,'ONLINE_LIVE_SESSION','Week 5 live — the number and the next action',
   'Reduction of Risk questions rarely ask what a value means. They ask what you do about it. That is the whole session.',
   NULL,
   '{"typical_duration_minutes":90}'),

  (5,3,1,'PDF','Handout — hyperkalemia at a glance',
   'One-page summary of causes, ECG changes and the treatment order. Print it if you can.',
   'Print this one. It is the page to have beside you while you drill.',
   '{"pdf_asset_id":"a4758a7d-baf6-4af5-855f-62ca09391189","estimated_minutes":15}'),
  (5,3,2,'PRACTICE_QUIZ','End-of-block mini-mock',
   'The halfway checkpoint — a mixed timed set across everything from weeks 1 to 5.',
   'Halfway point. Sit it honestly; I use these results to plan week 6.',
   '{"quiz_id":"1b7d34ac-767a-4b5d-a744-d82d78fd88b4"}'),

  -- ---- Week 6 — Physiological Adaptation --------------------------
  (6,1,1,'SHELF','Cardiac foundational',
   'Rhythm recognition from normal sinus outward — the three notes that make the cardiac emergencies readable.',
   'Start here. The emergencies make no sense until the rhythms do.', '{}'),
  (6,1,2,'LIBRARY_NOTE','Asthma vs COPD',
   'Two obstructive diseases that look alike on paper and are managed differently at the bedside.',
   NULL, '{}'),
  (6,1,3,'LIBRARY_NOTE','Hypoglycemia vs hyperglycemia',
   'Telling them apart fast, and why the wrong guess is dangerous in only one direction.',
   NULL, '{}'),
  (6,1,4,'LIBRARY_NOTE','Thyroid disorders snapshot',
   'Hyper- and hypothyroid signs side by side, plus the two crises.',
   NULL, '{}'),

  (6,2,1,'ONLINE_LIVE_SESSION','Week 6 live — emergencies, in priority order',
   'The heaviest week. Cardiac, respiratory, renal and endocrine emergencies, and how to rank two sick patients against each other.',
   'The longest session of the programme. Two hours — plan for it.',
   '{"typical_duration_minutes":120}'),

  (6,3,1,'PRACTICE_QUIZ','Cardiac practice set',
   'Untimed learning mode — rationales appear as you go, so treat this as study, not assessment.',
   'Read every rationale, including the ones you got right.',
   '{"quiz_id":"b49bc770-8de5-44a2-9446-e87240346ae8"}'),

  -- ---- Week 7 — Health Promotion and Maintenance ------------------
  (7,1,1,'LIBRARY_NOTE','Stages of labor',
   'The four stages, what happens in each, and the nursing priorities that change between them.',
   NULL, '{}'),
  (7,1,2,'LIBRARY_NOTE','Postpartum hemorrhage',
   'Recognition, the causes in order of likelihood, and the intervention sequence.',
   'The emergency the exam tests most often in this category.', '{}'),
  (7,1,3,'LIBRARY_NOTE','Newborn APGAR scoring',
   'The five components, the scoring, and what each total actually triggers.',
   NULL, '{}'),
  (7,1,4,'LIBRARY_NOTE','Pediatric vital signs by age',
   'Age-banded normals — the reference you need before any paediatric priority question makes sense.',
   NULL, '{}'),
  (7,1,5,'LIBRARY_NOTE','Vaccination schedule essentials',
   'The schedule points the exam actually asks about, plus contraindications.',
   NULL, '{}'),

  (7,2,1,'ONLINE_LIVE_SESSION','Week 7 live — maternity, newborn and paediatrics',
   'A lot of content, tested shallowly. The session is about knowing what is worth memorising and what is not.',
   NULL,
   '{"typical_duration_minutes":90}'),

  (7,3,1,'MOCK','Maternal health mock',
   'Timed and sequential across maternity, newborn and paediatric content.',
   'Last mock before the final week. Treat it as a dress rehearsal.',
   '{"quiz_id":"cbc6321c-9a78-4f70-b3ec-5684ffad6d72"}'),

  -- ---- Week 8 — Psychosocial Integrity and test readiness ---------
  (8,1,1,'LIBRARY_NOTE','Therapeutic communication techniques',
   'The responses that score and the ones that never do, with the reasoning behind both.',
   'Learn the pattern, not the phrases. The exam rewords them every time.', '{}'),
  (8,1,2,'LIBRARY_NOTE','Suicide risk assessment',
   'Risk factors, the questions you are expected to ask directly, and the safety priorities.',
   NULL, '{}'),
  (8,1,3,'LIBRARY_NOTE','Your last two weeks',
   'What to do — and stop doing — in the fourteen days before you sit.',
   'Read this even if your test date is months away. It changes how you use the time.', '{}'),

  (8,2,1,'ONLINE_LIVE_SESSION','Week 8 live — test day, and the week before it',
   'Psychosocial questions in the first half; your individual test-day plan in the second. Bring your questions — this is the last session.',
   'Come with questions. This session is partly yours.',
   '{"typical_duration_minutes":90}'),

  (8,3,1,'TEXT','Your test-day plan',
   'The checklist to work through once you have a test date: what to bring, what to do the night before, and what to do if it goes badly.',
   'Fill this in properly once your date is booked.',
   '{"body":"You have done the eight weeks. This is the part people improvise, and improvising is how a prepared candidate has a bad day.\n\nBOOKING. Book the date once you are consistently scoring at or above your target on the mocks — not before, and not indefinitely after. Waiting for certainty is the most common way candidates lose momentum.\n\nTHE WEEK BEFORE. Stop learning new content. Everything you do in the final week should be review of things you have already seen. New material this late does not settle; it just crowds out what had.\n\nTHE DAY BEFORE. One light review session, no more than two hours, in the morning. Then stop. Get your documents together — identification exactly as it appears on your registration, your authorisation to test, and the address of the centre with the route worked out. Sleep matters more than one more hour of questions.\n\nTHE MORNING. Eat something. Arrive early enough that traffic cannot become the story of your day. You are allowed breaks during the exam — plan to take at least one, even if you feel fine.\n\nDURING. Do not count questions. Do not try to read the algorithm from how hard the items feel — hard means the algorithm is working, and I said this in week 1 for a reason. Answer the question in front of you and let the machine do its job.\n\nIF IT GOES BADLY. It happens, and it is survivable. You can retake. Message me, and we will look at the candidate performance report together and plan the next attempt properly rather than repeating the same eight weeks louder.","estimated_minutes":10}'),
  (8,3,2,'EXTERNAL_LINK','Pearson VUE — scheduling your exam',
   'Where you actually book the test once your authorisation to test comes through.',
   'Do not book until we have talked about your mock scores.',
   '{"url":"https://home.pearsonvue.com/nclex","estimated_minutes":5}')

) AS v(w,b,o,type,title,description,note,payload)
ON CONFLICT (activity_id) DO UPDATE SET
  ordinal = EXCLUDED.ordinal, type = EXCLUDED.type,
  title = EXCLUDED.title, description = EXCLUDED.description,
  note = EXCLUDED.note, payload = EXCLUDED.payload,
  is_published = TRUE, updated_at = NOW();


-- =====================================================================
-- 6. Library-note and shelf attachments — the pointer rows
-- =====================================================================
-- One row per LIBRARY_NOTE / SHELF activity above, carrying which note
-- or which shelf the activity opens. The kind XOR is enforced by the
-- table: note rows set note_id, shelf rows set shelf_id, never both.
-- The attachment id mirrors its activity's (w,b,o) suffix.

INSERT INTO nclex_tutor_library_note_attachments (
  attachment_id, activity_id, note_id, shelf_id,
  programme_id, unit_id, block_id, position, caption
)
SELECT
  ('54000000-0000-4000-8000-' || lpad(v.w::text,4,'0') || lpad(v.b::text,4,'0') || lpad(v.o::text,4,'0'))::uuid,
  ('53000000-0000-4000-8000-' || lpad(v.w::text,4,'0') || lpad(v.b::text,4,'0') || lpad(v.o::text,4,'0'))::uuid,
  v.note_id::uuid, v.shelf_id::uuid,
  '50000000-0000-4000-8000-000000000001',
  ('51000000-0000-4000-8000-' || lpad(v.w::text,12,'0'))::uuid,
  ('52000000-0000-4000-8000-' || lpad(v.w::text,4,'0') || lpad(v.b::text,4,'0') || '0000')::uuid,
  v.o, NULL
FROM (VALUES
  -- Week 1
  (1,1,2,'55000000-0000-4000-8000-000000000001',NULL),                    -- Why the length of your exam tells you nothing
  (1,1,3,'59c113e5-0fcd-4d04-ad1a-1d91d222a203',NULL),                    -- Maslow's hierarchy on NCLEX
  (1,1,4,NULL,'55f2b871-d35d-496f-8a6d-06da6a5bebe0'),                    -- shelf: Week 1 essentials
  -- Week 2
  (2,1,1,'55000000-0000-4000-8000-000000000002',NULL),                    -- Delegation: who can do what
  (2,1,2,'e3eb4c15-3aec-46cd-b0d5-992651f4fe39',NULL),                    -- ABC priority hierarchy
  (2,1,3,NULL,'9447ba89-9b87-4672-baeb-e8442e4e0f72'),                    -- shelf: Foundational SATA pack
  -- Week 3
  (3,1,1,'55000000-0000-4000-8000-000000000003',NULL),                    -- Standard, contact, droplet, airborne
  (3,1,2,'33af9997-2289-4802-be98-9110668ea0db',NULL),                    -- Select-all-that-apply strategy
  -- Week 4
  (4,1,1,'55000000-0000-4000-8000-000000000004',NULL),                    -- Dosage calculation: the three formulas
  (4,1,2,NULL,'e7b9ff64-7082-490d-833c-a1f4a66cd3c5'),                    -- shelf: Drug deep dives
  -- Week 5
  (5,1,1,'6cd93a48-19d2-4f6c-9b82-275a6898996b',NULL),                    -- Quick reference: lab values
  (5,1,2,'1c71d58f-ca5c-48de-877b-e04d4ec9b763',NULL),                    -- ABG interpretation
  (5,1,3,NULL,'5ddc0699-f29b-4c5e-b6f2-3b47186b9353'),                    -- shelf: Renal Foundational
  -- Week 6
  (6,1,1,NULL,'3f73ba38-b715-45fe-a0f0-320369d7c238'),                    -- shelf: Cardiac foundational
  (6,1,2,'ed1308d0-0ffe-4ca5-ae4b-54c312e77a39',NULL),                    -- Asthma vs COPD
  (6,1,3,'0de5f48a-25ba-462d-8f8a-cad8f8534a89',NULL),                    -- Hypoglycemia vs hyperglycemia
  (6,1,4,'c9563362-f831-4a17-ae67-68313010ad35',NULL),                    -- Thyroid disorders snapshot
  -- Week 7
  (7,1,1,'fe256643-9d75-4c17-b8f6-59ab4948666b',NULL),                    -- Stages of labor
  (7,1,2,'2f7ca1e3-9262-48ee-b37d-aa42b00e641c',NULL),                    -- Postpartum hemorrhage
  (7,1,3,'b995611a-d64d-4f9b-9990-bc833482317b',NULL),                    -- Newborn APGAR scoring
  (7,1,4,'e004d0eb-ce1d-42d0-b906-b9f254dba04b',NULL),                    -- Pediatric vital signs by age
  (7,1,5,'791ae0df-93c2-4cd4-a101-8678529011e6',NULL),                    -- Vaccination schedule essentials
  -- Week 8
  (8,1,1,'a46651cf-a07c-4cd3-aaae-e2b2b46936c4',NULL),                    -- Therapeutic communication techniques
  (8,1,2,'e2c39634-3596-4c34-bcc9-1359a48bc863',NULL),                    -- Suicide risk assessment
  (8,1,3,'55000000-0000-4000-8000-000000000005',NULL)                     -- Your last two weeks
) AS v(w,b,o,note_id,shelf_id)
ON CONFLICT (attachment_id) DO UPDATE SET
  note_id = EXCLUDED.note_id, shelf_id = EXCLUDED.shelf_id,
  unit_id = EXCLUDED.unit_id, block_id = EXCLUDED.block_id,
  position = EXCLUDED.position;


-- =====================================================================
-- 7. Cohorts — one mid-run, one still upcoming
-- =====================================================================
-- Dates are relative to CURRENT_DATE so the demo always shows both
-- states: a cohort a few weeks in (the aired sessions carry
-- recordings) and one that has not started (open for enrolment).
--
-- Each start date is SNAPPED to the weekday its name promises —
-- cohort A back to the Tuesday on or before CURRENT_DATE - 21, cohort
-- B forward to the Saturday on or after CURRENT_DATE + 28. A raw
-- ± N offset would put "Tuesdays 19:00" on whatever weekday today
-- happens to be, and the first thing a tutor reads on the planner is
-- the date next to that name.
--
-- end_date = start + 55 days: eight full weeks, the last session
-- landing on day 49 with its week to run.

INSERT INTO nclex_cohorts (
  cohort_id, programme_id, name,
  start_date, end_date, cohort_size, allow_late_join
)
SELECT
  v.cohort_id::uuid, '50000000-0000-4000-8000-000000000001', v.name,
  v.start_date, v.start_date + 55, v.cohort_size, v.allow_late_join
FROM (
  SELECT
    '56000000-0000-4000-8000-00000000000a' AS cohort_id,
    'Evenings — Tuesdays 19:00 GMT' AS name,
    -- Tuesday (dow 2) on or before CURRENT_DATE - 21.
    (CURRENT_DATE - 21)
      - ((EXTRACT(DOW FROM CURRENT_DATE - 21)::int - 2 + 7) % 7) AS start_date,
    25 AS cohort_size, TRUE AS allow_late_join
  UNION ALL
  SELECT
    '56000000-0000-4000-8000-00000000000b',
    'Weekends — Saturdays 10:00 GMT',
    -- Saturday (dow 6) on or after CURRENT_DATE + 28.
    (CURRENT_DATE + 28)
      + ((6 - EXTRACT(DOW FROM CURRENT_DATE + 28)::int + 7) % 7),
    30, FALSE
) AS v
ON CONFLICT (cohort_id) DO UPDATE SET
  name = EXCLUDED.name,
  start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
  cohort_size = EXCLUDED.cohort_size,
  allow_late_join = EXCLUDED.allow_late_join,
  cancelled_at = NULL, updated_at = NOW();


-- =====================================================================
-- 8. Cohort checklist — every template activity, in both cohorts
-- =====================================================================
-- For a TUTOR_LED programme the student sees the curriculum THROUGH
-- these rows: no checklist row, no activity. There is no
-- seed-on-cohort-INSERT trigger to do it for us — one existed but was
-- retired 2026-06-25, so a new cohort starts unconfigured BY DESIGN
-- (absent row = the tutor has not included it yet). Hence the rows are
-- written here explicitly; a demo cohort has no tutor to click
-- "Include all".
--
-- release_date follows the same week-pacing default the app uses when
-- it creates one of these rows (lib/curriculum/cohort-attach.ts):
--   cohort.start_date + (unit_index - 1) x 7 days.
-- The after-class block additionally gets a due_date at the end of its
-- week, so the pitch shows what an activity window looks like.

INSERT INTO nclex_cohort_checklist_items (
  cohort_id, template_activity_id, is_included,
  release_date, due_date, close_date, source
)
SELECT
  c.cohort_id,
  a.activity_id,
  TRUE,
  c.start_date + ((u.unit_index - 1) * 7),
  CASE WHEN b.ordinal = 3
       THEN c.start_date + ((u.unit_index - 1) * 7) + 6
       ELSE NULL END,
  NULL,
  'TEMPLATE'
FROM   nclex_cohorts c
JOIN   nclex_programme_units u    ON u.programme_id = c.programme_id
JOIN   nclex_programme_activities a ON a.unit_id = u.unit_id
JOIN   nclex_programme_blocks b   ON b.block_id = a.block_id
WHERE  c.programme_id = '50000000-0000-4000-8000-000000000001'
  AND  a.cohort_id IS NULL
ON CONFLICT (cohort_id, template_activity_id) DO UPDATE SET
  is_included = TRUE,
  release_date = EXCLUDED.release_date,
  due_date = EXCLUDED.due_date,
  updated_at = NOW();


-- =====================================================================
-- 9. Live-session planner — the per-run schedule for each marker
-- =====================================================================
-- The ONLINE_LIVE_SESSION activity is a MARKER: identity and typical
-- duration only. Date, joining details and recording are per-cohort and
-- live here (live-sessions slice 1b). Week w's marker is always the
-- single activity in block 2, so its id is derivable.
--
-- Cohort A runs Tuesdays 19:00 GMT on Zoom; cohort B Saturdays 10:00
-- GMT on Google Meet. Any session whose date has already passed carries
-- a recording URL, so the pitch shows both halves of the feature.
--
-- The date comes from the cohort row itself (start_date + (w-1) weeks
-- + the run's time of day) rather than recomputing the CURRENT_DATE
-- arithmetic from section 7 — two copies of that sum would eventually
-- disagree, and the schedule is what students actually turn up on.

INSERT INTO nclex_cohort_live_sessions (
  session_id, cohort_id, marker_activity_id,
  scheduled_at, duration_minutes, platform,
  join_url, meeting_id, passcode, joining_instructions, recording_url
)
SELECT
  ('57000000-0000-4000-8000-' || s.tag || lpad(w::text,10,'0'))::uuid,
  s.cohort_id,
  ('53000000-0000-4000-8000-' || lpad(w::text,4,'0') || '00020001')::uuid,
  c.start_date::timestamptz + s.time_of_day + ((w - 1) * INTERVAL '7 days'),
  CASE WHEN w = 6 THEN 120 ELSE 90 END,
  s.platform,
  s.join_url,
  s.meeting_id,
  s.passcode,
  'Join five minutes early. Camera optional, microphone muted until you want the floor. If you drop out, rejoin with the same link — the meeting stays open.',
  CASE WHEN c.start_date::timestamptz + s.time_of_day + ((w - 1) * INTERVAL '7 days') < NOW()
       THEN 'https://example.com/mynclex/recordings/' || s.tag || '/week-' || w
       ELSE NULL END
FROM generate_series(1,8) w
CROSS JOIN (VALUES
  ('aa', '56000000-0000-4000-8000-00000000000a'::uuid, INTERVAL '19 hours',
   'ZOOM', 'https://us06web.zoom.us/j/98123456789', '981 2345 6789', '8WEEK'),
  ('bb', '56000000-0000-4000-8000-00000000000b'::uuid, INTERVAL '10 hours',
   'GOOGLE_MEET', 'https://meet.google.com/mnc-lexr-8wk', 'mnc-lexr-8wk', NULL)
) AS s(tag, cohort_id, time_of_day, platform, join_url, meeting_id, passcode)
JOIN nclex_cohorts c ON c.cohort_id = s.cohort_id
ON CONFLICT (cohort_id, marker_activity_id) DO UPDATE SET
  scheduled_at = EXCLUDED.scheduled_at,
  duration_minutes = EXCLUDED.duration_minutes,
  platform = EXCLUDED.platform,
  join_url = EXCLUDED.join_url,
  meeting_id = EXCLUDED.meeting_id,
  passcode = EXCLUDED.passcode,
  joining_instructions = EXCLUDED.joining_instructions,
  recording_url = EXCLUDED.recording_url,
  updated_at = NOW();


-- =====================================================================
-- 10. Programme-level quiz membership
-- =====================================================================
-- Normally written by the activity-save auto-mirror: saving an activity
-- with a non-null quiz_id upserts a row here too. Seeding the activities
-- directly in section 5 bypasses that action, so the rows are written
-- here. Without them the programme's Quizzes tab is empty and the
-- student read path keyed on quiz_id (slice 6) finds nothing, even
-- though the activities themselves resolve fine.

INSERT INTO nclex_programme_quizzes (programme_id, quiz_id)
SELECT DISTINCT u.programme_id, (a.payload->>'quiz_id')::uuid
FROM   nclex_programme_activities a
JOIN   nclex_programme_units u ON u.unit_id = a.unit_id
WHERE  u.programme_id = '50000000-0000-4000-8000-000000000001'
  AND  a.payload->>'quiz_id' IS NOT NULL
ON CONFLICT (programme_id, quiz_id) DO NOTHING;

COMMIT;
