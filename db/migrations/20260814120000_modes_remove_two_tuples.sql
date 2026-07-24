-- =========================================================
-- MyNclex — Modes: remove two conflicting (intent, mode) tuples
-- File: mynclex/db/migrations/20260814120000_modes_remove_two_tuples.sql
-- =========================================================
-- Plan: bank-consumption.html §15, bank-consumption-attempt-creation.html
-- §6.1.2. Decided with Sam 2026-07-24.
--
-- NOTHING IS DELETED HERE. All five mode IDs survive. What goes is two
-- PAIRINGS: Untimed Test stops being offered under EXAM, and Timed
-- Sequential stops being offered under STUDY. Both modes live on under the
-- other intent, so the column-level `mode IN (...)` CHECK, the ModeId type,
-- and every runner archetype are untouched.
--
-- WHY (EXAM, UNTIMED_TEST) GOES. It is not merely conceptually odd — it is
-- MECHANICALLY IDENTICAL to (STUDY, UNTIMED_TEST). Untimed modes get
-- duration_seconds = NULL, so there is no clock either way; both are free
-- navigation, feedback at the end, batched submit, the same FREE_BATCHED
-- runner path, and both resume. Since `intent` currently drives no runner
-- behaviour at all, the EXAM variant was a pure duplicate of its STUDY twin
-- whose only distinguishing feature was a label reading "no clock, single
-- sitting" — a promise the runner does not keep. The one thing that could
-- have justified it, "exam framing without time pressure", is precisely what
-- the STUDY version already is.
--
-- WHY (STUDY, TIMED_SEQUENTIAL) GOES. Forward-only exists to reproduce exam
-- mechanics (NCSBN: answer in the order presented, no going back, no
-- skipping). It carries no pedagogical purpose — stopping a student
-- reconsidering Q4 teaches nothing, it only removes an option. It is an exam
-- constraint wearing a study label, and it was also identical to its EXAM
-- twin for the same reason as above.
--
-- LANDING SHAPE — 3 and 3:
--   STUDY: UNTIMED_LEARNING, UNTIMED_TEST, TIMED_FREE_NAV
--   EXAM:  TIMED_FREE_NAV, TIMED_SEQUENTIAL, CAT
--
-- CONSEQUENCE WORTH KNOWING. STUDY's only remaining timed mode is
-- TIMED_FREE_NAV, whose entire distinction from the EXAM one is the
-- engagement-clock — a clock that pauses when the student steps away. That
-- clock is NOT BUILT (runner.html §8 derives the countdown from
-- started_at + duration_seconds with no intent branch, and there are no
-- pause columns on this table). So until it exists, STUDY/TIMED_FREE_NAV and
-- EXAM/TIMED_FREE_NAV still behave identically while one of them advertises
-- that it pauses. Tracked as the next piece of work, not fixed here.
--
-- ORDER MATTERS. The row conversion MUST precede the constraint rebuild:
-- adding a CHECK validates it against existing rows, so tightening first
-- would fail on our own data.
-- =========================================================

BEGIN;

-- ─────────────────────────────────────────────────────────
-- 1. Convert existing attempts off the two removed tuples
-- ─────────────────────────────────────────────────────────
-- Converted rather than deleted, on Sam's call: one of these is a COMPLETED
-- attempt and deleting it would punch a hole in a student's history for a
-- naming decision they never made. Both conversions are behaviour-preserving
-- because the removed tuples were duplicates of their surviving twins:
--
--   (EXAM, UNTIMED_TEST)      -> (STUDY, UNTIMED_TEST)
--       Same mode, so the clock, navigation, feedback timing and submit
--       model are all unchanged. Only the framing label moves.
--
--   (STUDY, TIMED_SEQUENTIAL) -> (STUDY, TIMED_FREE_NAV)
--       Same intent and the same countdown; the single change is that
--       navigation goes from forward-only to free. That is a LOOSENING, so
--       an in-progress attempt cannot break — a student gains the ability to
--       revisit, never loses a place they had already reached.
--
-- This also matters for DISPLAY, not just the constraint: four read paths
-- resolve a mode's label with
--   (intent === 'STUDY' ? MODES_STUDY : MODES_EXAM).find(m => m.id === mode)
-- and fall back to printing the raw id. A row left on a removed tuple would
-- render "UNTIMED_TEST" in History instead of "Untimed Test".
--
-- Expected on dev: 2 rows then 1 row. On prod: 0 and 0 — it has no attempts
-- at all — so both statements are no-ops there.

DO $$
DECLARE
  v_exam_untimed INTEGER;
  v_study_seq    INTEGER;
BEGIN
  UPDATE nclex_attempts
     SET intent = 'STUDY'
   WHERE intent = 'EXAM'
     AND mode   = 'UNTIMED_TEST';
  GET DIAGNOSTICS v_exam_untimed = ROW_COUNT;

  UPDATE nclex_attempts
     SET mode = 'TIMED_FREE_NAV'
   WHERE intent = 'STUDY'
     AND mode   = 'TIMED_SEQUENTIAL';
  GET DIAGNOSTICS v_study_seq = ROW_COUNT;

  RAISE NOTICE 'modes cut: (EXAM,UNTIMED_TEST)->(STUDY,UNTIMED_TEST) = % row(s); (STUDY,TIMED_SEQUENTIAL)->(STUDY,TIMED_FREE_NAV) = % row(s)',
    v_exam_untimed, v_study_seq;
END $$;


-- ─────────────────────────────────────────────────────────
-- 2. Attempts: rebuild the tuple CHECK — 8 tuples down to 6
-- ─────────────────────────────────────────────────────────

ALTER TABLE nclex_attempts
  DROP CONSTRAINT IF EXISTS nclex_attempts_intent_mode_tuple;

ALTER TABLE nclex_attempts
  ADD CONSTRAINT nclex_attempts_intent_mode_tuple CHECK (
    (intent, mode) IN (
      -- STUDY — your own pace, resumable. Differ by when the truth
      -- arrives, then by whether a clock runs.
      ('STUDY','UNTIMED_LEARNING'),   -- rationale after each submit
      ('STUDY','UNTIMED_TEST'),       -- rationale withheld to the end
      ('STUDY','TIMED_FREE_NAV'),     -- + a clock (engagement-clock, once built)
      -- EXAM — one bounded sitting. All timed, all feedback at the end;
      -- differ by navigation freedom and adaptivity.
      ('EXAM', 'TIMED_FREE_NAV'),     -- can revisit
      ('EXAM', 'TIMED_SEQUENTIAL'),   -- forward-only, NCSBN's own rule
      ('EXAM', 'CAT')                 -- adaptive, terminates on confidence
    )
  );


-- ─────────────────────────────────────────────────────────
-- 3. Tutor quizzes: rebuild its mirror CHECK — 7 pairs down to 5
-- ─────────────────────────────────────────────────────────
-- nclex_tutor_quizzes has no intent column; intent is DERIVED at launch
-- (MOCK -> EXAM, PRACTICE -> STUDY) by the two launch RPCs. So this CHECK is
-- a mirror of the one above and has to move with it, or a tutor could still
-- author a quiz that explodes on launch when the attempt INSERT hits the
-- tightened constraint above.
--
-- Verified before writing this: no quiz on dev uses either removed pairing
-- (the MOCKs are TIMED_FREE_NAV x1 + TIMED_SEQUENTIAL x2; the one
-- UNTIMED_TEST quiz is a PRACTICE, which derives STUDY and is unaffected).
-- So no data conversion is needed here.
--
-- Deliberately NOT auto-converting if one turns up: a tutor's authored quiz
-- must not be silently rewritten to a different mode behind their back. The
-- guard below fails loudly and names the offending rows instead.

DO $$
DECLARE
  v_bad TEXT;
BEGIN
  SELECT string_agg(quiz_id::TEXT || ' (' || quiz_kind || '/' || mode || ')', ', ')
    INTO v_bad
    FROM nclex_tutor_quizzes
   WHERE (quiz_kind, mode) IN (('MOCK','UNTIMED_TEST'), ('PRACTICE','TIMED_SEQUENTIAL'));

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot tighten nclex_tutor_quizzes_kind_mode_tuple: these quizzes use a removed (kind, mode) pairing and need a human decision on which mode they become: %',
      v_bad;
  END IF;
END $$;

ALTER TABLE nclex_tutor_quizzes
  DROP CONSTRAINT IF EXISTS nclex_tutor_quizzes_kind_mode_tuple;

ALTER TABLE nclex_tutor_quizzes
  ADD CONSTRAINT nclex_tutor_quizzes_kind_mode_tuple CHECK (
    (quiz_kind, mode) IN (
      -- PRACTICE -> STUDY intent
      ('PRACTICE', 'UNTIMED_LEARNING'),
      ('PRACTICE', 'UNTIMED_TEST'),
      ('PRACTICE', 'TIMED_FREE_NAV'),
      -- MOCK -> EXAM intent. Cannot be CAT: a CAT is its own surface
      -- (/student/bank/cat), spends a metered allowance, and is never
      -- authored as a tutor quiz.
      ('MOCK',     'TIMED_FREE_NAV'),
      ('MOCK',     'TIMED_SEQUENTIAL')
    )
  );

COMMIT;
