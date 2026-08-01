-- db/seed/pitch/06-demo-tutor.sql
--
-- Turns the working tutor account into a shareable DEMO tutor, so a
-- prospective tutor can be handed credentials and explore the platform
-- hands-on rather than watching a screen-share.
--
-- WHY RE-IDENTIFY RATHER THAN BUILD A SECOND ACCOUNT: every asset is
-- keyed by tutor_id — programmes, units, blocks, activities, library
-- notes, folders, shelves, quizzes, questions, media. Moving them to a
-- fresh account is an UPDATE across eight-plus tables where missing one
-- leaves a half-owned account and a broken programme. Re-identifying is
-- ONE row and nothing moves, so it cannot half-fail.
--
-- Sam keeps mybackpacc+mynclexsuperadmin@gmail.com (already TUTOR +
-- ADMIN + SUPER_ADMIN) as his own way in, so he is not locked out.
--
-- THE PERSONA. Only the person's name changes. The business identity
-- already on the account — "NCLEX ProSolutions", the bio, the headline,
-- the logo — is name-neutral and stays as it is.
--
-- THE EMAIL stays on an alias Sam controls rather than moving to
-- @example.com. Two reasons: password reset still works, and the tutor
-- actually RECEIVES the enquiry and waitlist notifications the entry-path
-- programmes exist to demonstrate. An unroutable address would drop them
-- silently, mid-pitch. The cost is that a prospect who opens account
-- settings sees the alias — cosmetic, and it does not carry a name.
--
-- SHARED AND MUTABLE, deliberately. Prospects can edit and delete demo
-- content. That is survivable because every seed in this folder is
-- idempotent: re-run 01 → 06 to restore the demo to a known state
-- between pitches.

BEGIN;

-- =====================================================================
-- 1. The persona
-- =====================================================================

UPDATE auth.users SET
  email = 'mybackpacc+steven@gmail.com',
  -- bcrypt, matching the existing accounts' format. Shared demo
  -- credential — change it in the UI whenever you like.
  encrypted_password = extensions.crypt('StevenHarris2026!', extensions.gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  updated_at = NOW()
WHERE id = '4ed777d7-e4f7-403b-88f4-63ce5432d65e';

UPDATE nclex_users SET
  email = 'mybackpacc+steven@gmail.com',
  forename = 'Steven',
  surname  = 'Harris',
  name     = 'Steven Harris',
  must_change_password = FALSE,
  is_active = TRUE,
  updated_at = NOW()
WHERE id = '4ed777d7-e4f7-403b-88f4-63ce5432d65e';


-- =====================================================================
-- 2. Clear the account's old student history
-- =====================================================================
-- This was a working test login for months, and the leftovers demo
-- badly on the student side:
--
--   • 35 IN_PROGRESS sittings. Each one renders a "resume" prompt, so
--     the student dashboard opened onto a wall of half-finished
--     sessions.
--   • 1 ABANDONED sitting.
--   • A PROGRAMME_ASSIGNED sitting against "NCLEX 4-Week Tutor-Led
--     Bootcamp" — one of the old test programmes, which the account is
--     not enrolled in. It uses the STANDALONE attempt shape
--     (programme_id + quiz_id, programme_activity_id NULL), so a query
--     joining through the activity shows it as programme-less; it is
--     not orphaned, just stale.
--
-- Sam's call: clear ALL of the account's pre-existing student history,
-- not just the half-finished sessions. The demo student's record should
-- be about the two pitch programmes and nothing else — 33 unrelated bank
-- sittings and a handful of readiness packs are noise a prospect has to
-- read past.
--
-- The ONE exception is enforced by the database, not by choice:
-- nclex_readiness_credits.attempt_id is ON DELETE RESTRICT, so a sitting
-- with a claimed credit behind it cannot be deleted. That guard exists
-- to stop a purchased pack losing the attempt that consumed it, and
-- routing around it would mean destroying the credit record too. Two
-- readiness sittings are held back by it and stay.

DELETE FROM nclex_attempts
WHERE student_id = '4ed777d7-e4f7-403b-88f4-63ce5432d65e'
  AND status IN ('IN_PROGRESS', 'ABANDONED');

DELETE FROM nclex_attempts a
WHERE a.student_id = '4ed777d7-e4f7-403b-88f4-63ce5432d65e'
  AND a.source <> 'PROGRAMME_ASSIGNED'
  AND NOT EXISTS (
    SELECT 1 FROM nclex_readiness_credits c WHERE c.attempt_id = a.attempt_id);

DELETE FROM nclex_attempts a
WHERE a.student_id = '4ed777d7-e4f7-403b-88f4-63ce5432d65e'
  AND a.source = 'PROGRAMME_ASSIGNED'
  AND a.programme_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM nclex_enrolments e
    WHERE e.user_id = a.student_id
      AND e.programme_id = a.programme_id
      AND e.status IN ('ENROLLED', 'PAUSED'));


-- =====================================================================
-- 3. The same account as a student
-- =====================================================================
-- The account already carries BOTH roles, so the in-app switcher works
-- without signing out — which is the whole reason for using one login.
-- But switching to the student side lands on an empty dashboard unless
-- the account is actually enrolled in something.
--
-- Enrolled in his OWN programmes. The tutor-side "add student" action
-- refuses this ("You can't enrol yourself in your own programme.") and
-- that guard is right for real tutors, but a demo account has to stand
-- on both sides of the same programme. Writing the rows directly is the
-- deliberate exception, not an oversight.
--
-- Cohort A, the one four weeks in: weeks 1–4 are released and weeks 5–8
-- are not, so the student view shows the release gating rather than a
-- flat list.

INSERT INTO nclex_enrolments (
  enrolment_id, user_id, programme_id, cohort_id, status, enrolment_source,
  enrolled_at, approved_at, strategy_id
) VALUES
  ('71000000-0000-4000-8000-000000000900',
   '4ed777d7-e4f7-403b-88f4-63ce5432d65e',
   '50000000-0000-4000-8000-000000000001',
   '56000000-0000-4000-8000-00000000000a',
   'ENROLLED', 'SELF_PAID',
   NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days',
   '58000000-0000-4000-8000-000000000001'),
  ('71000000-0000-4000-8000-000000000901',
   '4ed777d7-e4f7-403b-88f4-63ce5432d65e',
   '60000000-0000-4000-8000-000000000001',
   NULL, 'ENROLLED', 'SELF_PAID',
   NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days',
   '68000000-0000-4000-8000-000000000001')
ON CONFLICT (enrolment_id) DO UPDATE SET
  status = 'ENROLLED', cohort_id = EXCLUDED.cohort_id,
  strategy_id = EXCLUDED.strategy_id, updated_at = NOW();


-- =====================================================================
-- 4. Enough history to look used, and enough left to demo
-- =====================================================================
-- Weeks 1 and 2 sat, weeks 3 and 4 released but NOT sat. A dashboard
-- that is entirely finished is as useless to show as an empty one —
-- this leaves live work on screen: two quizzes outstanding, a recording
-- to catch up on, progress bars part-filled.
--
-- Same insert-then-flip order as 05: the progress writeback fires on the
-- status UPDATE, so §6 is what creates the progress rows.

INSERT INTO nclex_attempts (
  attempt_id, student_id, source, programme_activity_id, intent, mode,
  duration_seconds, status, created_at, started_at, last_activity_at, ended_at,
  requested_question_count, actual_question_count, actual_unit_count, pass_score
)
SELECT
  md5('steven' || s.quiz_id::text)::uuid,
  '4ed777d7-e4f7-403b-88f4-63ce5432d65e', 'PROGRAMME_ASSIGNED', s.activity_id,
  CASE WHEN q.quiz_kind = 'MOCK' THEN 'EXAM' ELSE 'STUDY' END,
  q.mode, q.duration_seconds, 'IN_PROGRESS',
  s.sat_at, s.sat_at, s.sat_at + INTERVAL '28 minutes', s.sat_at + INTERVAL '28 minutes',
  q.items, q.items, q.items, q.pass_score
FROM (
  SELECT (CASE w WHEN 1 THEN 'f99feeae-3339-4534-96bd-ede4beeeee31'
                 ELSE      '2f6a604d-5cf9-48d0-9bf1-dbad4d66c3fa' END)::uuid AS quiz_id,
         '53000000-0000-4000-8000-' || lpad(w::text,4,'0') || '00030001' AS activity_id,
         c.start_date::timestamptz + ((w - 1) * INTERVAL '7 days') + INTERVAL '2 days 20 hours' AS sat_at
  FROM   nclex_cohorts c
  CROSS  JOIN generate_series(1, 2) AS w
  WHERE  c.cohort_id = '56000000-0000-4000-8000-00000000000a'
  UNION ALL
  SELECT '66000000-0000-4000-8000-000000000001'::uuid,
         '63000000-0000-4000-8000-000100020001',
         NOW() - INTERVAL '6 days'
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
WHERE  a.student_id = '4ed777d7-e4f7-403b-88f4-63ce5432d65e'
  AND  a.source = 'PROGRAMME_ASSIGNED'
ON CONFLICT (attempt_item_id) DO NOTHING;

-- Scores a solid-but-imperfect 78% band, so the review screens have both
-- right and wrong answers to open — including partial-credit ones.
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
      SELECT o->>'id' FROM jsonb_array_elements(ai.content_snapshot_json->'options') o
      WHERE  o->>'id' <> ai.correct_answer_snapshot_json->>'answer'
      ORDER  BY o->>'id' LIMIT 1
    ))
  END,
  'SUBMITTED', g.correct,
  CASE
    WHEN g.correct THEN ai.marks_snapshot
    WHEN ai.question_type IN ('SATA','SELECT_N','CLOZE','HIGHLIGHT')
      THEN greatest(ai.marks_snapshot - 1, 0)
    ELSE 0
  END,
  30 + (abs(hashtext(ai.attempt_item_id::text)) % 70),
  a.ended_at
FROM   nclex_attempt_items ai
JOIN   nclex_attempts a ON a.attempt_id = ai.attempt_id
CROSS  JOIN LATERAL (
  SELECT (abs(hashtext(ai.attempt_id::text || ai.item_id)) % 100) < 78 AS correct
) AS g
WHERE  a.student_id = '4ed777d7-e4f7-403b-88f4-63ce5432d65e'
  AND  a.source = 'PROGRAMME_ASSIGNED'
ON CONFLICT (attempt_item_id) DO UPDATE SET
  answer_json = EXCLUDED.answer_json, is_correct = EXCLUDED.is_correct,
  score_awarded = EXCLUDED.score_awarded, submission_status = 'SUBMITTED',
  submitted_at = EXCLUDED.submitted_at;


-- =====================================================================
-- 5. No perfect papers
-- =====================================================================
-- The flat 78% roll can still pass every item on a five-question quiz,
-- and it did on both weekly sittings the first time this ran. A demo
-- student with a perfect record has nothing to open on the review
-- screen — no rationale worth reading, no scoring strip worth showing.
--
-- So: any all-correct programme sitting has its LAST item flipped to
-- wrong. Deterministic, and it guarantees at least one thing to review
-- in every sitting.

WITH perfect AS (
  SELECT a.attempt_id
  FROM   nclex_attempts a
  WHERE  a.student_id = '4ed777d7-e4f7-403b-88f4-63ce5432d65e'
    AND  a.source = 'PROGRAMME_ASSIGNED'
  GROUP  BY a.attempt_id
  HAVING NOT EXISTS (
    SELECT 1 FROM nclex_attempt_items ai
    JOIN   nclex_attempt_answers an ON an.attempt_item_id = ai.attempt_item_id
    WHERE  ai.attempt_id = a.attempt_id AND an.is_correct IS NOT TRUE)
), target AS (
  SELECT DISTINCT ON (ai.attempt_id) ai.attempt_item_id
  FROM   nclex_attempt_items ai JOIN perfect p ON p.attempt_id = ai.attempt_id
  ORDER  BY ai.attempt_id, ai.position DESC
)
UPDATE nclex_attempt_answers an SET
  is_correct = FALSE,
  score_awarded = CASE WHEN ai.question_type IN ('SATA','SELECT_N','CLOZE','HIGHLIGHT')
                       THEN greatest(ai.marks_snapshot - 1, 0) ELSE 0 END,
  answer_json = CASE
    WHEN ai.question_type = 'CLOZE'
      THEN (ai.correct_answer_snapshot_json->'answers')
           - (SELECT min(k) FROM jsonb_object_keys(ai.correct_answer_snapshot_json->'answers') k)
    WHEN ai.question_type = 'HIGHLIGHT'
      THEN COALESCE((SELECT jsonb_agg(e.val ORDER BY e.ord)
        FROM jsonb_array_elements(ai.correct_answer_snapshot_json->'correct_ids') WITH ORDINALITY AS e(val, ord)
        WHERE e.ord < jsonb_array_length(ai.correct_answer_snapshot_json->'correct_ids')), '[]'::jsonb)
    WHEN ai.question_type IN ('SATA','SELECT_N')
      THEN COALESCE((SELECT jsonb_agg(e.val ORDER BY e.ord)
        FROM jsonb_array_elements(ai.correct_answer_snapshot_json->'answers') WITH ORDINALITY AS e(val, ord)
        WHERE e.ord < jsonb_array_length(ai.correct_answer_snapshot_json->'answers')), '[]'::jsonb)
    ELSE to_jsonb((SELECT o->>'id' FROM jsonb_array_elements(ai.content_snapshot_json->'options') o
      WHERE o->>'id' <> ai.correct_answer_snapshot_json->>'answer' ORDER BY o->>'id' LIMIT 1))
  END
FROM nclex_attempt_items ai, target t
WHERE ai.attempt_item_id = an.attempt_item_id
  AND t.attempt_item_id = an.attempt_item_id;


-- =====================================================================
-- 6. Score and complete — this writes the progress rows
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
  AND a.student_id = '4ed777d7-e4f7-403b-88f4-63ce5432d65e'
  AND a.source = 'PROGRAMME_ASSIGNED';


-- =====================================================================
-- 7. Attendance for the sessions that have aired
-- =====================================================================
-- Present for weeks 1–3, absent for week 4 — so there is a recording to
-- catch up on rather than a spotless record.

INSERT INTO nclex_cohort_session_attendance (session_id, student_id, status, marked_by, marked_at)
SELECT s.session_id, '4ed777d7-e4f7-403b-88f4-63ce5432d65e',
       CASE WHEN row_number() OVER (ORDER BY s.scheduled_at) <= 3
            THEN 'PRESENT' ELSE 'ABSENT' END,
       '4ed777d7-e4f7-403b-88f4-63ce5432d65e', s.scheduled_at + INTERVAL '2 hours'
FROM   nclex_cohort_live_sessions s
WHERE  s.cohort_id = '56000000-0000-4000-8000-00000000000a'
  AND  s.scheduled_at < NOW()
ON CONFLICT (session_id, student_id) DO UPDATE SET
  status = EXCLUDED.status, marked_at = EXCLUDED.marked_at;

COMMIT;
