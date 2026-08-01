-- db/seed/pitch/05-demo-students.sql
--
-- The half of the tutor pitch the first two seeds could not show: what
-- happens AFTER a student enrols. Without this, Enrolments, Students,
-- Results, Sessions and Assignments all render empty on both new
-- programmes — and those six screens are where a tutor's actual job
-- lives.
--
-- Seeds 18 students, enrols them across the flagship's two cohorts and
-- the crash course, and gives them a plausible history: quiz attempts
-- with per-item answers, activity progress, and live-session attendance.
--
-- WHY NOT REUSE THE EXISTING STUDENTS: dev has 17 student-role users,
-- but 14 are named "Samuel Owusu-Ansah" on mybackpacc+… aliases. A
-- roster showing one name fourteen times demos worse than an empty one.
--
-- SAFETY OF THE FAKE ACCOUNTS:
--   • @example.com is reserved by RFC 2606 and can never route, so no
--     seeded address can reach a real inbox.
--   • Every row carries signup_source = 'SEED_DEMO' — the single
--     predicate that identifies and removes the whole set:
--       DELETE FROM auth.users WHERE id IN
--         (SELECT id FROM nclex_users WHERE signup_source = 'SEED_DEMO');
--     Everything else cascades from there.
--   • Names are invented. Any resemblance to a real person is chance.
--   • No password hash is set: these accounts cannot be logged into.
--
-- Deterministic ids so the file is re-runnable:
--   70…                       students
--   71…                       enrolments
--   md5(student || quiz)      attempts       (and derived rows)
--
-- TWO TRIGGERS DO WORK FOR US, which is why the order below matters:
--   • nclex_attempts_progress_writeback fires AFTER UPDATE OF status, so
--     attempts are inserted IN_PROGRESS and flipped to COMPLETED in §6 —
--     that writes the progress rows for free.
--   • nclex_attendance_progress_writeback fires on attendance INSERT,
--     writing ATTENDANCE progress for live sessions the same way (§7).
-- Item statistics are NOT trigger-driven; §8 calls the refresh function.

BEGIN;

-- =====================================================================
-- 1. Students
-- =====================================================================
-- nclex_users.id references auth.users(id), so the auth row comes first.
-- Only `id` is genuinely required there; everything else below is set so
-- the rows look ordinary to anything that inspects them.

INSERT INTO auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', v.email, NOW() - INTERVAL '60 days',
       NOW() - INTERVAL '60 days', NOW(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('seed', 'mynclex-pitch')
FROM (VALUES
  ('70000000-0000-4000-8000-000000000001','ama.boateng@example.com'),
  ('70000000-0000-4000-8000-000000000002','kwame.mensah@example.com'),
  ('70000000-0000-4000-8000-000000000003','akosua.darko@example.com'),
  ('70000000-0000-4000-8000-000000000004','yaw.owusu@example.com'),
  ('70000000-0000-4000-8000-000000000005','efua.asante@example.com'),
  ('70000000-0000-4000-8000-000000000006','kofi.adjei@example.com'),
  ('70000000-0000-4000-8000-000000000007','abena.nyarko@example.com'),
  ('70000000-0000-4000-8000-000000000008','kwabena.ofori@example.com'),
  ('70000000-0000-4000-8000-000000000009','adwoa.frimpong@example.com'),
  ('70000000-0000-4000-8000-000000000010','kojo.danquah@example.com'),
  ('70000000-0000-4000-8000-000000000011','esi.appiah@example.com'),
  ('70000000-0000-4000-8000-000000000012','kwaku.gyamfi@example.com'),
  ('70000000-0000-4000-8000-000000000013','afia.sarpong@example.com'),
  ('70000000-0000-4000-8000-000000000014','yaa.amoah@example.com'),
  ('70000000-0000-4000-8000-000000000015','kwesi.bediako@example.com'),
  ('70000000-0000-4000-8000-000000000016','araba.quaye@example.com'),
  ('70000000-0000-4000-8000-000000000017','nana.aidoo@example.com'),
  ('70000000-0000-4000-8000-000000000018','maame.tetteh@example.com')
) AS v(id, email)
ON CONFLICT (id) DO NOTHING;

INSERT INTO nclex_users (id, email, forename, surname, name, phone_number,
                         is_active, signup_source, created_at)
SELECT v.id::uuid, v.email, v.forename, v.surname,
       v.forename || ' ' || v.surname, v.phone,
       TRUE, 'SEED_DEMO', NOW() - INTERVAL '60 days'
FROM (VALUES
  ('70000000-0000-4000-8000-000000000001','ama.boateng@example.com','Ama','Boateng','+233 24 000 0001'),
  ('70000000-0000-4000-8000-000000000002','kwame.mensah@example.com','Kwame','Mensah','+233 24 000 0002'),
  ('70000000-0000-4000-8000-000000000003','akosua.darko@example.com','Akosua','Darko','+233 24 000 0003'),
  ('70000000-0000-4000-8000-000000000004','yaw.owusu@example.com','Yaw','Owusu','+233 24 000 0004'),
  ('70000000-0000-4000-8000-000000000005','efua.asante@example.com','Efua','Asante','+233 24 000 0005'),
  ('70000000-0000-4000-8000-000000000006','kofi.adjei@example.com','Kofi','Adjei','+233 24 000 0006'),
  ('70000000-0000-4000-8000-000000000007','abena.nyarko@example.com','Abena','Nyarko','+233 24 000 0007'),
  ('70000000-0000-4000-8000-000000000008','kwabena.ofori@example.com','Kwabena','Ofori','+233 24 000 0008'),
  ('70000000-0000-4000-8000-000000000009','adwoa.frimpong@example.com','Adwoa','Frimpong','+233 24 000 0009'),
  ('70000000-0000-4000-8000-000000000010','kojo.danquah@example.com','Kojo','Danquah','+233 24 000 0010'),
  ('70000000-0000-4000-8000-000000000011','esi.appiah@example.com','Esi','Appiah','+233 24 000 0011'),
  ('70000000-0000-4000-8000-000000000012','kwaku.gyamfi@example.com','Kwaku','Gyamfi','+233 24 000 0012'),
  ('70000000-0000-4000-8000-000000000013','afia.sarpong@example.com','Afia','Sarpong','+233 24 000 0013'),
  ('70000000-0000-4000-8000-000000000014','yaa.amoah@example.com','Yaa','Amoah','+233 24 000 0014'),
  ('70000000-0000-4000-8000-000000000015','kwesi.bediako@example.com','Kwesi','Bediako','+233 24 000 0015'),
  ('70000000-0000-4000-8000-000000000016','araba.quaye@example.com','Araba','Quaye','+233 24 000 0016'),
  ('70000000-0000-4000-8000-000000000017','nana.aidoo@example.com','Nana','Aidoo','+233 24 000 0017'),
  ('70000000-0000-4000-8000-000000000018','maame.tetteh@example.com','Maame','Tetteh','+233 24 000 0018')
) AS v(id, email, forename, surname, phone)
ON CONFLICT (id) DO UPDATE SET
  forename = EXCLUDED.forename, surname = EXCLUDED.surname,
  name = EXCLUDED.name, phone_number = EXCLUDED.phone_number,
  signup_source = 'SEED_DEMO', is_active = TRUE, updated_at = NOW();

INSERT INTO nclex_user_roles (user_id, role)
SELECT id, 'STUDENT' FROM nclex_users WHERE signup_source = 'SEED_DEMO'
ON CONFLICT (user_id, role) DO NOTHING;


-- =====================================================================
-- 2. Enrolments
-- =====================================================================
-- Deliberately not uniform — a roster where everyone is in the same
-- state teaches a tutor nothing. Cohort A (mid-run) carries 11 active
-- students plus one paused for an overdue installment; cohort B
-- (upcoming) carries 5 active plus one awaiting approval. Six of the
-- cohort A students also bought the self-paced crash course, which is
-- what a real catalogue looks like.
--
-- Payment strategy rotates across the flagship's three plans so the
-- Payments screen has all three to show.

-- nclex_enrolments_actor_consistent: SELF_PAID must leave
-- enrolled_by_user_id NULL, and anything else must set it. The
-- TUTOR_ADDED rows therefore carry the tutor as the acting user.

INSERT INTO nclex_enrolments (
  enrolment_id, user_id, programme_id, cohort_id, status, enrolment_source,
  enrolled_by_user_id,
  enrolled_at, approved_at, strategy_id, paused_at, paused_reason
)
SELECT
  ('71000000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  ('70000000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid,
  '50000000-0000-4000-8000-000000000001',
  v.cohort::uuid,
  v.status,
  CASE WHEN v.n % 5 = 0 THEN 'TUTOR_ADDED' ELSE 'SELF_PAID' END,
  CASE WHEN v.n % 5 = 0
       THEN '4ed777d7-e4f7-403b-88f4-63ce5432d65e'::uuid ELSE NULL END,
  c.start_date::timestamptz - INTERVAL '9 days',
  CASE WHEN v.status = 'PENDING_APPROVAL' THEN NULL
       ELSE c.start_date::timestamptz - INTERVAL '9 days' END,
  ('58000000-0000-4000-8000-' || lpad(((v.n % 3) + 1)::text, 12, '0'))::uuid,
  CASE WHEN v.status = 'PAUSED' THEN NOW() - INTERVAL '4 days' ELSE NULL END,
  CASE WHEN v.status = 'PAUSED' THEN 'INSTALLMENT_OVERDUE' ELSE NULL END
FROM (VALUES
  ( 1,'56000000-0000-4000-8000-00000000000a','ENROLLED'),
  ( 2,'56000000-0000-4000-8000-00000000000a','ENROLLED'),
  ( 3,'56000000-0000-4000-8000-00000000000a','ENROLLED'),
  ( 4,'56000000-0000-4000-8000-00000000000a','ENROLLED'),
  ( 5,'56000000-0000-4000-8000-00000000000a','ENROLLED'),
  ( 6,'56000000-0000-4000-8000-00000000000a','ENROLLED'),
  ( 7,'56000000-0000-4000-8000-00000000000a','ENROLLED'),
  ( 8,'56000000-0000-4000-8000-00000000000a','ENROLLED'),
  ( 9,'56000000-0000-4000-8000-00000000000a','ENROLLED'),
  (10,'56000000-0000-4000-8000-00000000000a','ENROLLED'),
  (11,'56000000-0000-4000-8000-00000000000a','ENROLLED'),
  (12,'56000000-0000-4000-8000-00000000000a','PAUSED'),
  (13,'56000000-0000-4000-8000-00000000000b','ENROLLED'),
  (14,'56000000-0000-4000-8000-00000000000b','ENROLLED'),
  (15,'56000000-0000-4000-8000-00000000000b','ENROLLED'),
  (16,'56000000-0000-4000-8000-00000000000b','ENROLLED'),
  (17,'56000000-0000-4000-8000-00000000000b','ENROLLED'),
  (18,'56000000-0000-4000-8000-00000000000b','PENDING_APPROVAL')
) AS v(n, cohort, status)
JOIN nclex_cohorts c ON c.cohort_id = v.cohort::uuid
ON CONFLICT (enrolment_id) DO UPDATE SET
  status = EXCLUDED.status, cohort_id = EXCLUDED.cohort_id,
  strategy_id = EXCLUDED.strategy_id, paused_at = EXCLUDED.paused_at,
  paused_reason = EXCLUDED.paused_reason, updated_at = NOW();

-- Six of them also on the self-paced crash course (cohort_id NULL).
INSERT INTO nclex_enrolments (
  enrolment_id, user_id, programme_id, cohort_id, status, enrolment_source,
  enrolled_at, approved_at, strategy_id, access_expires_at
)
SELECT
  ('71000000-0000-4000-8000-' || lpad((100 + n)::text, 12, '0'))::uuid,
  ('70000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '60000000-0000-4000-8000-000000000001',
  NULL, 'ENROLLED', 'SELF_PAID',
  NOW() - ((20 - n) * INTERVAL '1 day'),
  NOW() - ((20 - n) * INTERVAL '1 day'),
  '68000000-0000-4000-8000-000000000001',
  NOW() - ((20 - n) * INTERVAL '1 day') + INTERVAL '90 days'
FROM generate_series(1, 6) AS n
ON CONFLICT (enrolment_id) DO UPDATE SET
  status = EXCLUDED.status, access_expires_at = EXCLUDED.access_expires_at,
  updated_at = NOW();

COMMIT;


BEGIN;

-- =====================================================================
-- 3. Quiz sittings
-- =====================================================================
-- Who sat what, and when. NOT everyone sits everything — a roster where
-- all 12 students are level teaches a tutor nothing, and "who has fallen
-- behind" is the question the Students screen exists to answer:
--
--   students 1–8   all four weekly quizzes   (on track)
--   students 9–10  weeks 1–3                 (one behind)
--   student  11    weeks 1–2                 (two behind)
--   student  12    week 1 only               (the paused one)
--
-- Attempts are keyed md5(student || quiz) so a re-run updates in place.
-- They are inserted IN_PROGRESS on purpose: the progress writeback fires
-- AFTER UPDATE OF status, so §6 flips them and the progress rows appear.
--
-- Shape is the ACTIVITY-LINKED branch of nclex_attempts_source_refs:
-- programme_activity_id set, programme_id and quiz_id NULL.

INSERT INTO nclex_attempts (
  attempt_id, student_id, source, programme_activity_id, intent, mode,
  duration_seconds, status, created_at, started_at, last_activity_at, ended_at,
  requested_question_count, actual_question_count, actual_unit_count, pass_score
)
SELECT
  md5(s.student_id::text || s.quiz_id::text)::uuid,
  s.student_id, 'PROGRAMME_ASSIGNED', s.activity_id,
  CASE WHEN q.quiz_kind = 'MOCK' THEN 'EXAM' ELSE 'STUDY' END,
  q.mode, q.duration_seconds, 'IN_PROGRESS',
  s.sat_at, s.sat_at, s.sat_at + INTERVAL '35 minutes',
  s.sat_at + INTERVAL '35 minutes',
  q.items, q.items, q.items, q.pass_score
FROM (
  -- Flagship: cohort A students, one quiz per elapsed week.
  SELECT u.id AS student_id,
         (CASE w WHEN 1 THEN 'f99feeae-3339-4534-96bd-ede4beeeee31'
                 WHEN 2 THEN '2f6a604d-5cf9-48d0-9bf1-dbad4d66c3fa'
                 WHEN 3 THEN 'a5e394bf-c664-4ad6-a9d8-c46ce6b8fee5'
                 ELSE      'aebe5044-27dc-46f0-8819-63642894da10' END)::uuid AS quiz_id,
         '53000000-0000-4000-8000-' || lpad(w::text,4,'0') || '00030001' AS activity_id,
         c.start_date::timestamptz + ((w - 1) * INTERVAL '7 days') + INTERVAL '3 days 19 hours' AS sat_at
  FROM   nclex_users u
  JOIN   nclex_enrolments e ON e.user_id = u.id
                           AND e.programme_id = '50000000-0000-4000-8000-000000000001'
  JOIN   nclex_cohorts c ON c.cohort_id = e.cohort_id
  CROSS  JOIN generate_series(1, 4) AS w
  WHERE  u.signup_source = 'SEED_DEMO'
    AND  e.cohort_id = '56000000-0000-4000-8000-00000000000a'
    AND  w <= CASE
               WHEN right(u.id::text, 3)::int <= 8  THEN 4
               WHEN right(u.id::text, 3)::int <= 10 THEN 3
               WHEN right(u.id::text, 3)::int = 11  THEN 2
               ELSE 1 END

  UNION ALL

  -- Crash course: the six self-paced buyers, module drills 1–3.
  SELECT u.id,
         ('66000000-0000-4000-8000-' || lpad(m::text, 12, '0'))::uuid,
         '63000000-0000-4000-8000-' || lpad(m::text,4,'0') || '00020001',
         NOW() - ((14 - (m * 3)) * INTERVAL '1 day')
  FROM   nclex_users u
  CROSS  JOIN generate_series(1, 3) AS m
  WHERE  u.signup_source = 'SEED_DEMO'
    AND  right(u.id::text, 3)::int <= 6
) AS s
JOIN (
  SELECT q.quiz_id, q.quiz_kind, q.mode, q.duration_seconds, q.pass_score,
         count(i.item_id)::int AS items
  FROM   nclex_tutor_quizzes q
  JOIN   nclex_tutor_quiz_items i ON i.quiz_id = q.quiz_id
  GROUP  BY q.quiz_id, q.quiz_kind, q.mode, q.duration_seconds, q.pass_score
) AS q ON q.quiz_id = s.quiz_id
ON CONFLICT (attempt_id) DO UPDATE SET
  status = 'IN_PROGRESS', final_score = NULL,
  started_at = EXCLUDED.started_at, ended_at = EXCLUDED.ended_at,
  updated_at = NOW();


-- =====================================================================
-- 4. The questions as delivered
-- =====================================================================
-- nclex_attempt_items is a SNAPSHOT: it copies the question so the
-- attempt survives the source item being edited or deleted. These are
-- tutor-authored, so item_source = 'TUTOR' and tutor_id must be set
-- (nclex_attempt_items_tutor_id_consistent).

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
JOIN   nclex_users u ON u.id = a.student_id AND u.signup_source = 'SEED_DEMO'
JOIN   nclex_programme_activities pa ON pa.activity_id = a.programme_activity_id::uuid
JOIN   nclex_tutor_quiz_items qi ON qi.quiz_id = (pa.payload->>'quiz_id')::uuid
JOIN   nclex_tutor_questions tq ON tq.item_id = qi.item_id
ON CONFLICT (attempt_item_id) DO NOTHING;


-- =====================================================================
-- 5. The answers
-- =====================================================================
-- Correctness is deterministic, not random, so the file is re-runnable
-- and a given student's profile is stable across re-seeds: a per-student
-- ability (42–86) adjusted by the item's difficulty, rolled against a
-- hash of (attempt, item).
--
-- WRONG ANSWERS ARE NOT UNIFORM. A missed single-answer item scores
-- zero, but a missed SATA drops one correct option and therefore earns
-- PARTIAL credit — score > 0 with is_correct FALSE. That is deliberate:
-- is_correct is full-credit-only by design, so this is what exercises
-- the three-state verdict and the scoring strip.

INSERT INTO nclex_attempt_answers (
  answer_id, attempt_item_id, attempt_id, student_id, answer_json,
  submission_status, is_correct, score_awarded, time_spent_sec, submitted_at
)
SELECT
  md5(ai.attempt_item_id::text || 'answer')::uuid,
  ai.attempt_item_id, ai.attempt_id, a.student_id,
  CASE
    -- The flagship's older quizzes are not all option-based: they carry
    -- CLOZE (answer = a blank->choice MAP) and HIGHLIGHT (answer = a bare
    -- id ARRAY, scored plus/minus per lib/scoring/dispatch.ts). Both need
    -- their own branch or they fall through to the single-answer case and
    -- land as NULL.
    WHEN g.correct AND ai.question_type = 'CLOZE'
      THEN ai.correct_answer_snapshot_json->'answers'
    WHEN g.correct AND ai.question_type = 'HIGHLIGHT'
      THEN ai.correct_answer_snapshot_json->'correct_ids'
    WHEN ai.question_type = 'CLOZE'
      THEN (ai.correct_answer_snapshot_json->'answers')
           - (SELECT min(k) FROM jsonb_object_keys(ai.correct_answer_snapshot_json->'answers') k)
    WHEN ai.question_type = 'HIGHLIGHT'
      THEN COALESCE((
        SELECT jsonb_agg(e.val ORDER BY e.ord)
        FROM   jsonb_array_elements(ai.correct_answer_snapshot_json->'correct_ids')
               WITH ORDINALITY AS e(val, ord)
        WHERE  e.ord < jsonb_array_length(ai.correct_answer_snapshot_json->'correct_ids')
      ), '[]'::jsonb)
    WHEN g.correct AND ai.question_type IN ('SATA','SELECT_N')
      THEN ai.correct_answer_snapshot_json->'answers'
    WHEN g.correct
      THEN to_jsonb(ai.correct_answer_snapshot_json->>'answer')
    WHEN ai.question_type IN ('SATA','SELECT_N')
      THEN COALESCE((
        SELECT jsonb_agg(e.val ORDER BY e.ord)
        FROM   jsonb_array_elements(ai.correct_answer_snapshot_json->'answers')
               WITH ORDINALITY AS e(val, ord)
        WHERE  e.ord < jsonb_array_length(ai.correct_answer_snapshot_json->'answers')
      ), '[]'::jsonb)
    ELSE to_jsonb((
      SELECT o->>'id'
      FROM   jsonb_array_elements(ai.content_snapshot_json->'options') o
      WHERE  o->>'id' <> ai.correct_answer_snapshot_json->>'answer'
      ORDER  BY o->>'id'
      LIMIT  1
    ))
  END,
  'SUBMITTED', g.correct,
  CASE
    WHEN g.correct THEN ai.marks_snapshot
    WHEN ai.question_type IN ('SATA','SELECT_N','CLOZE','HIGHLIGHT')
      THEN greatest(ai.marks_snapshot - 1, 0)
    ELSE 0
  END,
  25 + (abs(hashtext(ai.attempt_item_id::text)) % 90),
  a.ended_at
FROM   nclex_attempt_items ai
JOIN   nclex_attempts a ON a.attempt_id = ai.attempt_id
JOIN   nclex_users u ON u.id = a.student_id AND u.signup_source = 'SEED_DEMO'
CROSS  JOIN LATERAL (
  SELECT (abs(hashtext(ai.attempt_id::text || ai.item_id)) % 100)
         < ( (42 + ((right(a.student_id::text, 3)::int * 7) % 45))
             + CASE ai.classification_snapshot->>'difficulty'
                 WHEN 'Very easy' THEN 15 WHEN 'Easy' THEN 8
                 WHEN 'Hard' THEN -10 WHEN 'Very hard' THEN -18
                 ELSE 0 END ) AS correct
) AS g
ON CONFLICT (attempt_item_id) DO UPDATE SET
  answer_json = EXCLUDED.answer_json, is_correct = EXCLUDED.is_correct,
  score_awarded = EXCLUDED.score_awarded, submission_status = 'SUBMITTED',
  submitted_at = EXCLUDED.submitted_at;


-- =====================================================================
-- 6. Score and complete — this is what writes the progress rows
-- =====================================================================
-- final_score is the item-equivalent average: awarded marks over
-- available marks. Setting status here (not at insert) is what fires
-- nclex_attempts_progress_writeback.

UPDATE nclex_attempts a SET
  final_score = t.score,
  status = CASE WHEN a.mode LIKE 'TIMED%' AND t.score < 0.35
                THEN 'TIMED_OUT' ELSE 'COMPLETED' END,
  updated_at = NOW()
FROM (
  SELECT ai.attempt_id,
         round(sum(an.score_awarded) / nullif(sum(ai.marks_snapshot), 0), 4) AS score
  FROM   nclex_attempt_items ai
  JOIN   nclex_attempt_answers an ON an.attempt_item_id = ai.attempt_item_id
  GROUP  BY ai.attempt_id
) AS t
WHERE a.attempt_id = t.attempt_id
  AND EXISTS (SELECT 1 FROM nclex_users u2
              WHERE u2.id = a.student_id AND u2.signup_source = 'SEED_DEMO');


-- =====================================================================
-- 7. Live-session attendance
-- =====================================================================
-- Only for cohort A sessions that have already aired. PRESENT derives an
-- ATTENDANCE progress row via nclex_progress_on_attendance(); ABSENT and
-- EXCUSED derive nothing, and EXCUSED also drops out of the percentage
-- denominator at read time — so the register needs all three to be worth
-- looking at.

INSERT INTO nclex_cohort_session_attendance (session_id, student_id, status, marked_by, marked_at)
SELECT s.session_id, u.id,
       CASE
         WHEN (abs(hashtext(s.session_id::text || u.id::text)) % 100) < 78 THEN 'PRESENT'
         WHEN (abs(hashtext(s.session_id::text || u.id::text)) % 100) < 92 THEN 'ABSENT'
         ELSE 'EXCUSED'
       END,
       '4ed777d7-e4f7-403b-88f4-63ce5432d65e', s.scheduled_at + INTERVAL '2 hours'
FROM   nclex_cohort_live_sessions s
JOIN   nclex_enrolments e ON e.cohort_id = s.cohort_id AND e.status IN ('ENROLLED','PAUSED')
JOIN   nclex_users u ON u.id = e.user_id AND u.signup_source = 'SEED_DEMO'
WHERE  s.cohort_id = '56000000-0000-4000-8000-00000000000a'
  AND  s.scheduled_at < NOW()
ON CONFLICT (session_id, student_id) DO UPDATE SET
  status = EXCLUDED.status, marked_at = EXCLUDED.marked_at;

COMMIT;

-- =====================================================================
-- 8. Item statistics
-- =====================================================================
-- NOT trigger-driven — the stats table is refreshed by an explicit call.
-- Without this the "how everyone else answered" strip on the review
-- screen has nothing to show for any of the seeded answers.

SELECT nclex_refresh_item_response_stats();
