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
-- THE STUDENT SIDE IS NOT HERE. This account briefly stood on both sides
-- of its own programmes via the role switcher; that moved to
-- 07-demo-student.sql, which repurposes a separate STUDENT-ONLY login as
-- Miss Claudia Harris. §3 below removes what this one picked up.
--
-- SHARED AND MUTABLE, deliberately. Prospects can edit and delete demo
-- content. That is survivable because every seed in this folder is
-- idempotent: re-run 01 → 07 to restore the demo to a known state
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
-- 3. No student side
-- =====================================================================
-- This account was briefly enrolled in its own two programmes, so the
-- role switcher had somewhere to land. That is now 07-demo-student.sql's
-- job: Miss Claudia Harris is a separate, STUDENT-ONLY login.
--
-- Two logins beat one dual-role login for a demo. The tutor stopped
-- appearing in his own Students roster, and no screen has to be
-- qualified with "am I looking at this as the tutor or the student?".
--
-- Anything the account picked up as a student is removed here. Order
-- matters: attendance is keyed on (session_id, student_id) with no
-- enrolment in the key, so it does not follow the enrolment and has to
-- go first or it is stranded.
--
-- The STUDENT ROLE ITSELF IS KEPT. Dropping it would also take the
-- Question Bank away from this account — a separate product with its own
-- subscription and readiness credits on it — and that is a different
-- decision from "do not be a student on your own programmes".

DELETE FROM nclex_cohort_session_attendance
WHERE student_id = '4ed777d7-e4f7-403b-88f4-63ce5432d65e';

DELETE FROM nclex_attempts
WHERE student_id = '4ed777d7-e4f7-403b-88f4-63ce5432d65e'
  AND source = 'PROGRAMME_ASSIGNED';

DELETE FROM nclex_student_activity_progress
WHERE student_id = '4ed777d7-e4f7-403b-88f4-63ce5432d65e';

DELETE FROM nclex_enrolments
WHERE user_id = '4ed777d7-e4f7-403b-88f4-63ce5432d65e';

COMMIT;
