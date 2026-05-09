-- =========================================================
-- MyNclex — Slice 4.5b: Attempt duration_seconds default
-- File: mynclex/db/migrations/20260509140000_slice_4_5b_attempt_duration_default.sql
-- =========================================================
-- Bug surfaced 2026-05-09 during 4.5b testing: timed attempts (mode
-- = TIMED_FREE_NAV / TIMED_SEQUENTIAL) were rendering as stopwatch
-- instead of countdown. Root cause: slice 2.2a's nclex_create_attempt
-- never sets duration_seconds — the column was nullable on the
-- nclex_attempts table and the RPC's INSERT just omits it. Result:
-- every attempt landed with duration_seconds=NULL, so 4.5a's runner
-- correctly fell through to the untimed stopwatch path.
--
-- Per attempt-creation §6: "duration_seconds — nullable. Set for
-- timed modes (whether EXAM wall-clock or STUDY engagement-clock).
-- NULL for untimed modes." So the column SHOULD be set for timed
-- attempts at creation. The 2.2a RPC missed it.
--
-- Fix: BEFORE INSERT trigger that sets duration_seconds = 90 * the
-- requested count when:
--   • duration_seconds was not explicitly provided (still NULL), AND
--   • mode is one of the two v1 timed modes.
--
-- Why a trigger (not modifying the create-attempt RPC body): isolates
-- the change to ~20 lines instead of re-defining the 500-line RPC.
-- Also applies the default to any future INSERT path (tests, manual
-- SQL, slice 3.x's CAT create function). Future per-mode tuning of
-- the default lives in this one helper.
--
-- Why 90 seconds per question:
--   • Real NCLEX-RN CAT averages ~84 sec/Q (5 hours / 145 questions).
--   • UWorld practice mode: 90 sec/Q (industry standard for prep).
--   • ATI: 60 sec/Q for timed practice.
--   • Sherpath: 75 sec/Q.
-- 90 sec gives a touch more breathing room than real NCLEX while
-- staying authentic. Easy to tune in the helper if Sam wants to
-- differentiate by mode (e.g. tighter for sequential, looser for
-- free-nav) later.
--
-- Why requested_question_count (not actual_question_count): the trigger
-- fires BEFORE INSERT, when actual hasn't been computed yet (the
-- create-attempt RPC sets actual via UPDATE after the unit-pool walk).
-- The drift band is ±3 units, so timer might be ±~4.5 minutes off
-- ideal — acceptable for v1; can be revisited later if the slip
-- matters.
--
-- Source of truth:
--   docs/product-plan/bank-consumption-runner.html §8 (settled 2026-05-09)
--   docs/product-plan/bank-consumption-attempt-creation.html §6, §11

CREATE OR REPLACE FUNCTION _nclex_set_attempt_duration_default()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only set when:
  --   1. The caller didn't already provide a duration (still NULL),
  --   2. The mode is one of the v1 timed modes,
  --   3. requested_question_count is non-null and positive.
  --
  -- CAT is intentionally excluded — it has variable length governed by
  -- the IRT termination rule, not a per-question timer (slice 3.x).
  IF NEW.duration_seconds IS NULL
     AND NEW.mode IN ('TIMED_FREE_NAV', 'TIMED_SEQUENTIAL')
     AND NEW.requested_question_count IS NOT NULL
     AND NEW.requested_question_count > 0
  THEN
    NEW.duration_seconds := NEW.requested_question_count * 90;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nclex_attempts_set_duration_default ON nclex_attempts;

CREATE TRIGGER nclex_attempts_set_duration_default
BEFORE INSERT ON nclex_attempts
FOR EACH ROW
EXECUTE FUNCTION _nclex_set_attempt_duration_default();

-- Backfill existing IN_PROGRESS timed attempts so any in-flight
-- timed quizzes pick up a sensible duration on next page load. New
-- attempts get the trigger; old ones get this one-shot UPDATE.
UPDATE nclex_attempts
SET duration_seconds = requested_question_count * 90,
    updated_at       = NOW()
WHERE duration_seconds IS NULL
  AND mode IN ('TIMED_FREE_NAV', 'TIMED_SEQUENTIAL')
  AND requested_question_count IS NOT NULL
  AND requested_question_count > 0
  AND status = 'IN_PROGRESS';
