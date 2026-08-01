-- db/seed/pitch/07-demo-student.sql
--
-- A SEPARATE login for the student experience: Miss Claudia Harris.
--
-- 06 put the demo tutor on both sides of the platform, using the in-app
-- role switcher. It works, but it confuses the demo — the tutor turns up
-- in his own Students roster, and every screen has to be read twice
-- ("am I looking at this as Steven-the-tutor or Steven-the-student?").
-- Two logins, one per side, is simply easier to show.
--
-- Repurposes mybackpacc+mynclexstudent@gmail.com — an existing account
-- Sam already has the password for. The password is NOT changed.
--
-- WHY THIS ACCOUNT AND NOT ONE OF THE 18 SEEDED STUDENTS: the seeded
-- students have no password by design and cannot be logged into. This
-- one can, and Sam holds the credential.
--
-- WHY A STUDENT-ONLY ACCOUNT MATTERS: it carries the STUDENT role and
-- nothing else. The dual-role listing bug fixed in
-- lib/programmes/student-actions.ts only bites accounts that are also
-- tutors, so Claudia shows exactly her two programmes on dev TODAY,
-- without waiting for that fix to merge.
--
-- Her profile is deliberately WEAKER than Steven's student side: three
-- weeks sat in the mid-60s, two sessions missed, the crash course barely
-- started. Two demo students who both look excellent teach a
-- prospective tutor nothing about spotting the one who needs chasing.

BEGIN;

-- =====================================================================
-- 1. The persona
-- =====================================================================
-- Password deliberately untouched — Sam already has it.

UPDATE auth.users SET
  email = 'mybackpacc+claudia@gmail.com',
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  updated_at = NOW()
WHERE id = '385acbf4-fa50-4924-98f4-e1c46635ee1d';

UPDATE nclex_users SET
  email = 'mybackpacc+claudia@gmail.com',
  forename = 'Claudia',
  surname  = 'Harris',
  name     = 'Miss Claudia Harris',
  is_active = TRUE,
  must_change_password = FALSE,
  updated_at = NOW()
WHERE id = '385acbf4-fa50-4924-98f4-e1c46635ee1d';


-- =====================================================================
-- 2. Clear what the account carried as a test login
-- =====================================================================
-- Two PAUSED enrolments on the old May test programmes (Self-Paced
-- Refresher, 4-Week Bootcamp) and six bank sittings. None of it belongs
-- to the pitch, and a PAUSED pill on a programme she is not being shown
-- is exactly the noise this account is meant to remove.

DELETE FROM nclex_attempts
WHERE student_id = '385acbf4-fa50-4924-98f4-e1c46635ee1d'
  AND NOT EXISTS (
    SELECT 1 FROM nclex_readiness_credits c
    WHERE c.attempt_id = nclex_attempts.attempt_id);

DELETE FROM nclex_enrolments
WHERE user_id = '385acbf4-fa50-4924-98f4-e1c46635ee1d';

-- Attendance does NOT follow the enrolment. The register is keyed on
-- (session_id, student_id) with no enrolment in the key, so clearing the
-- rows above leaves any mark the account picked up in a cohort it is no
-- longer in — here a PRESENT from June against the old Bootcamp's Q3
-- cohort, which then counted toward "sessions attended" on a programme
-- she is not being shown.
--
-- Applies to both demo accounts, and is the last of the three
-- enrolment-shaped leftovers this account carried.

DELETE FROM nclex_cohort_session_attendance at
USING nclex_cohort_live_sessions s
WHERE s.session_id = at.session_id
  AND at.student_id IN ('385acbf4-fa50-4924-98f4-e1c46635ee1d',
                        '4ed777d7-e4f7-403b-88f4-63ce5432d65e')
  AND NOT EXISTS (
    SELECT 1 FROM nclex_enrolments e
    WHERE e.user_id = at.student_id
      AND e.cohort_id = s.cohort_id
      AND e.status IN ('ENROLLED', 'PAUSED'));


-- =====================================================================
-- 3. Enrolled in the two pitch programmes
-- =====================================================================
-- Cohort A of the flagship — the run that is four weeks in — plus the
-- self-paced crash course.

INSERT INTO nclex_enrolments (
  enrolment_id, user_id, programme_id, cohort_id, status, enrolment_source,
  enrolled_at, approved_at, strategy_id, access_expires_at
) VALUES
  ('71000000-0000-4000-8000-000000000910',
   '385acbf4-fa50-4924-98f4-e1c46635ee1d',
   '50000000-0000-4000-8000-000000000001',
   '56000000-0000-4000-8000-00000000000a',
   'ENROLLED', 'SELF_PAID',
   NOW() - INTERVAL '32 days', NOW() - INTERVAL '32 days',
   '58000000-0000-4000-8000-000000000003', NULL),
  ('71000000-0000-4000-8000-000000000911',
   '385acbf4-fa50-4924-98f4-e1c46635ee1d',
   '60000000-0000-4000-8000-000000000001',
   NULL, 'ENROLLED', 'SELF_PAID',
   NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days',
   '68000000-0000-4000-8000-000000000001',
   NOW() - INTERVAL '5 days' + INTERVAL '90 days')
ON CONFLICT (enrolment_id) DO UPDATE SET
  status = 'ENROLLED', cohort_id = EXCLUDED.cohort_id,
  strategy_id = EXCLUDED.strategy_id,
  access_expires_at = EXCLUDED.access_expires_at, updated_at = NOW();

-- She is on the four-instalment plan, so the tutor's Payments screen has
-- a student mid-plan to show rather than only paid-in-full ones.


-- =====================================================================
-- 4. Her history — three weeks in, and struggling a little
-- =====================================================================
-- Inserted IN_PROGRESS; §6 flips them, which is what writes the progress
-- rows via nclex_attempts_progress_writeback.

INSERT INTO nclex_attempts (
  attempt_id, student_id, source, programme_activity_id, intent, mode,
  duration_seconds, status, created_at, started_at, last_activity_at, ended_at,
  requested_question_count, actual_question_count, actual_unit_count, pass_score
)
SELECT
  md5('claudia' || s.quiz_id::text)::uuid,
  '385acbf4-fa50-4924-98f4-e1c46635ee1d', 'PROGRAMME_ASSIGNED', s.activity_id,
  CASE WHEN q.quiz_kind = 'MOCK' THEN 'EXAM' ELSE 'STUDY' END,
  q.mode, q.duration_seconds, 'IN_PROGRESS',
  s.sat_at, s.sat_at, s.sat_at + INTERVAL '41 minutes', s.sat_at + INTERVAL '41 minutes',
  q.items, q.items, q.items, q.pass_score
FROM (
  SELECT (CASE w WHEN 1 THEN 'f99feeae-3339-4534-96bd-ede4beeeee31'
                 WHEN 2 THEN '2f6a604d-5cf9-48d0-9bf1-dbad4d66c3fa'
                 ELSE      'a5e394bf-c664-4ad6-a9d8-c46ce6b8fee5' END)::uuid AS quiz_id,
         '53000000-0000-4000-8000-' || lpad(w::text,4,'0') || '00030001' AS activity_id,
         c.start_date::timestamptz + ((w - 1) * INTERVAL '7 days') + INTERVAL '5 days 21 hours' AS sat_at
  FROM   nclex_cohorts c
  CROSS  JOIN generate_series(1, 3) AS w
  WHERE  c.cohort_id = '56000000-0000-4000-8000-00000000000a'
) AS s
JOIN (
  SELECT q.quiz_id, q.quiz_kind, q.mode, q.duration_seconds, q.pass_score,
         count(i.item_id)::int AS items
  FROM   nclex_tutor_quizzes q
  JOIN   nclex_tutor_quiz_items i ON i.quiz_id = q.quiz_id
  GROUP  BY q.quiz_id, q.quiz_kind, q.mode, q.duration_seconds, q.pass_score
) AS q ON q.quiz_id = s.quiz_id
ON CONFLICT (attempt_id) DO UPDATE SET
  status = 'IN_PROGRESS', final_score = NULL, updated_at = NOW();

INSERT INTO nclex_attempt_items (
  attempt_item_id, attempt_id, position, item_id, item_source, tutor_id,
  selection_unit_type, selection_unit_id, question_type, stem_snapshot,
  rationale_snapshot, marks_snapshot, classification_snapshot,
  content_snapshot_json, correct_answer_snapshot_json, created_at
)
SELECT
  md5(a.attempt_id::text || qi.item_id)::uuid,
  a.attempt_id, qi.position, qi.item_id, 'TUTOR', tq.tutor_id,
  'QUESTION', qi.item_id, tq.question_type, tq.stem,
  tq.rationale, tq.marks,
  jsonb_build_object('topic', tq.topic, 'subtopic', tq.subtopic,
                     'difficulty', tq.difficulty,
                     'client_needs_category', tq.client_needs_category),
  tq.content, tq.correct, a.started_at
FROM   nclex_attempts a
JOIN   nclex_programme_activities pa ON pa.activity_id = a.programme_activity_id::uuid
JOIN   nclex_tutor_quiz_items qi ON qi.quiz_id = (pa.payload->>'quiz_id')::uuid
JOIN   nclex_tutor_questions tq ON tq.item_id = qi.item_id
WHERE  a.student_id = '385acbf4-fa50-4924-98f4-e1c46635ee1d'
ON CONFLICT (attempt_item_id) DO NOTHING;

-- 62% band — below Steven, and below the 65-70% pass marks on the mocks,
-- so she reads as the student a tutor would want to chase.
INSERT INTO nclex_attempt_answers (
  answer_id, attempt_item_id, attempt_id, student_id, answer_json,
  submission_status, is_correct, score_awarded, time_spent_sec, submitted_at
)
SELECT
  md5(ai.attempt_item_id::text || 'answer')::uuid,
  ai.attempt_item_id, ai.attempt_id, a.student_id,
  CASE
    WHEN g.correct AND ai.question_type = 'CLOZE'
      THEN ai.correct_answer_snapshot_json->'answers'
    WHEN g.correct AND ai.question_type = 'HIGHLIGHT'
      THEN ai.correct_answer_snapshot_json->'correct_ids'
    WHEN ai.question_type = 'CLOZE'
      THEN (ai.correct_answer_snapshot_json->'answers')
           - (SELECT min(k) FROM jsonb_object_keys(ai.correct_answer_snapshot_json->'answers') k)
    WHEN ai.question_type = 'HIGHLIGHT'
      THEN COALESCE((SELECT jsonb_agg(e.val ORDER BY e.ord)
        FROM jsonb_array_elements(ai.correct_answer_snapshot_json->'correct_ids') WITH ORDINALITY AS e(val, ord)
        WHERE e.ord < jsonb_array_length(ai.correct_answer_snapshot_json->'correct_ids')), '[]'::jsonb)
    WHEN g.correct AND ai.question_type IN ('SATA','SELECT_N')
      THEN ai.correct_answer_snapshot_json->'answers'
    WHEN g.correct THEN to_jsonb(ai.correct_answer_snapshot_json->>'answer')
    WHEN ai.question_type IN ('SATA','SELECT_N')
      THEN COALESCE((SELECT jsonb_agg(e.val ORDER BY e.ord)
        FROM jsonb_array_elements(ai.correct_answer_snapshot_json->'answers') WITH ORDINALITY AS e(val, ord)
        WHERE e.ord < jsonb_array_length(ai.correct_answer_snapshot_json->'answers')), '[]'::jsonb)
    ELSE to_jsonb((SELECT o->>'id' FROM jsonb_array_elements(ai.content_snapshot_json->'options') o
      WHERE o->>'id' <> ai.correct_answer_snapshot_json->>'answer' ORDER BY o->>'id' LIMIT 1))
  END,
  'SUBMITTED', g.correct,
  CASE WHEN g.correct THEN ai.marks_snapshot
       WHEN ai.question_type IN ('SATA','SELECT_N','CLOZE','HIGHLIGHT')
         THEN greatest(ai.marks_snapshot - 1, 0)
       ELSE 0 END,
  40 + (abs(hashtext(ai.attempt_item_id::text)) % 110),
  a.ended_at
FROM   nclex_attempt_items ai
JOIN   nclex_attempts a ON a.attempt_id = ai.attempt_id
CROSS  JOIN LATERAL (
  SELECT (abs(hashtext(ai.attempt_id::text || ai.item_id)) % 100) < 62 AS correct
) AS g
WHERE  a.student_id = '385acbf4-fa50-4924-98f4-e1c46635ee1d'
ON CONFLICT (attempt_item_id) DO UPDATE SET
  answer_json = EXCLUDED.answer_json, is_correct = EXCLUDED.is_correct,
  score_awarded = EXCLUDED.score_awarded, submission_status = 'SUBMITTED',
  submitted_at = EXCLUDED.submitted_at;


-- =====================================================================
-- 5. Score and complete — this writes the progress rows
-- =====================================================================

UPDATE nclex_attempts a SET
  final_score = t.score,
  status = CASE WHEN a.status = 'IN_PROGRESS' THEN 'COMPLETED' ELSE a.status END,
  updated_at = NOW()
FROM (
  SELECT ai.attempt_id,
         round(sum(an.score_awarded) / nullif(sum(ai.marks_snapshot), 0), 4) AS score
  FROM   nclex_attempt_items ai
  JOIN   nclex_attempt_answers an ON an.attempt_item_id = ai.attempt_item_id
  GROUP  BY ai.attempt_id
) AS t
WHERE a.attempt_id = t.attempt_id
  AND a.student_id = '385acbf4-fa50-4924-98f4-e1c46635ee1d';


-- =====================================================================
-- 6. Attendance — two of the four sessions missed
-- =====================================================================
-- Present for weeks 1 and 2, absent for 3, excused for 4. Between the
-- mid-60s scores and a patchy register she is the student the tutor
-- would ring, which is the thing worth demonstrating.

INSERT INTO nclex_cohort_session_attendance (session_id, student_id, status, marked_by, marked_at)
SELECT s.session_id, '385acbf4-fa50-4924-98f4-e1c46635ee1d',
       CASE row_number() OVER (ORDER BY s.scheduled_at)
         WHEN 1 THEN 'PRESENT' WHEN 2 THEN 'PRESENT'
         WHEN 3 THEN 'ABSENT'  ELSE 'EXCUSED' END,
       '4ed777d7-e4f7-403b-88f4-63ce5432d65e', s.scheduled_at + INTERVAL '2 hours'
FROM   nclex_cohort_live_sessions s
WHERE  s.cohort_id = '56000000-0000-4000-8000-00000000000a'
  AND  s.scheduled_at < NOW()
ON CONFLICT (session_id, student_id) DO UPDATE SET
  status = EXCLUDED.status, marked_at = EXCLUDED.marked_at;

COMMIT;
