-- =========================================================
-- MyNclex — Engagement clock for Study → Timed practice
-- File: mynclex/db/migrations/20260815120000_engagement_clock.sql
-- =========================================================
-- Makes the (STUDY, TIMED_FREE_NAV) mode honour the promise its config has
-- always made — clock: 'engagement' — "pauses if you step away, resumable".
-- Until now the runner derived the countdown from `started_at +
-- duration_seconds - now()` with NO intent branch (runner §8), so the clock
-- drained while the student was away, identical to the EXAM wall clock.
--
-- Design + full reasoning: BUILD_LIST #6 (2026-07-25 build); the four
-- findings in bank-consumption.html §15 / attempt-creation §6.1.2.
--
-- The shift: an engagement-clocked attempt no longer measures WALL time
-- since start. It measures ENGAGED time — the seconds the student was
-- actually present and working. `remaining = duration_seconds -
-- engaged_seconds_used`. Away-time (page hidden — tab-switch, screen-off,
-- backgrounded, closed) is fully forgiven, even across a full close and a
-- return days later (Sam's call 2026-07-25: "all of it").
--
-- Because away-time is forgiven across a full CLOSE, the clock cannot live
-- only in the browser (which forgets everything on unload). The engaged
-- total is persisted here, on the attempt row, and the client resumes
-- counting from it. The client saves at the natural moments — on submit, on
-- navigation, and the instant the page goes hidden — no background
-- heartbeat (a device dying mid-question forgives that one question's time,
-- which lands in the student's favour; see BUILD_LIST #6).
--
-- SCOPE: this column + RPC are for (STUDY, TIMED_FREE_NAV) ONLY. Every other
-- mode is untouched — EXAM stays wall-clock, the untimed Study modes have no
-- clock, CAT has its own engine. The RPC refuses to write to anything else,
-- so a stray client call can't corrupt an exam clock.
--
-- Additive: one nullable column + one new function. No existing object is
-- redefined. Safe on prod (no attempts there).


-- =========================================================
-- 1. engaged_seconds_used — the persisted engaged total
-- =========================================================
-- NULL for every non-engagement attempt (nothing writes it there) and for a
-- brand-new engagement attempt that hasn't saved yet — both read as "0 used"
-- client-side. Monotonic: the RPC only ever moves it forward, and never past
-- the attempt's own duration.
ALTER TABLE nclex_attempts
  ADD COLUMN IF NOT EXISTS engaged_seconds_used INTEGER
    CHECK (engaged_seconds_used IS NULL OR engaged_seconds_used >= 0);

COMMENT ON COLUMN nclex_attempts.engaged_seconds_used IS
  'Engagement clock (STUDY, TIMED_FREE_NAV only): total ENGAGED seconds the '
  'student has spent present-and-working. remaining = duration_seconds - '
  'engaged_seconds_used. NULL elsewhere / before first save = treated as 0. '
  'Written only by nclex_record_engaged_time (monotonic, clamped to duration).';


-- =========================================================
-- 2. nclex_record_engaged_time — monotonic engaged-time save
-- =========================================================
-- The client fires this on submit / navigation / page-hide with its running
-- engaged total. Mirrors nclex_add_answer_time's shape (SECURITY DEFINER,
-- auth.uid() ownership, silent no-op once terminal) but at the ATTEMPT level.
--
-- Three guards make it safe to expose to the browser:
--   • ownership — must be the student's own attempt (or SUPER_ADMIN),
--   • liveness  — silent no-op once the attempt is terminal (races the
--                 finish/expire click, exactly like the time-flush),
--   • mode      — silent no-op unless (STUDY, TIMED_FREE_NAV). This is the
--                 belt-and-braces: even a buggy or malicious client cannot
--                 freeze an EXAM clock by writing engaged_seconds_used.
--
-- Monotonic + clamped: GREATEST(existing, LEAST(incoming, duration)). Forward
-- only (a stale out-of-order save can't rewind the clock) and never past the
-- budget (so remaining never goes negative from a bad client value).
CREATE OR REPLACE FUNCTION nclex_record_engaged_time(
  p_attempt_id      UUID,
  p_engaged_seconds INTEGER
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student  UUID := auth.uid();
  v_owner    UUID;
  v_status   TEXT;
  v_intent   TEXT;
  v_mode     TEXT;
  v_duration INTEGER;
  v_value    INTEGER;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- Nothing to record for a null / negative value.
  IF p_engaged_seconds IS NULL OR p_engaged_seconds < 0 THEN
    RETURN;
  END IF;

  SELECT student_id, status, intent, mode, duration_seconds
  INTO   v_owner,     v_status, v_intent, v_mode, v_duration
  FROM nclex_attempts
  WHERE attempt_id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt not found: %', p_attempt_id;
  END IF;

  IF v_owner <> v_student AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your attempt';
  END IF;

  -- Silent no-op once terminal — the client fires persistNow() just before
  -- the finish/expire click, so a late save legitimately races the flip.
  IF v_status <> 'IN_PROGRESS' THEN
    RETURN;
  END IF;

  -- Mode guard: the engagement clock exists for exactly one tuple. Any other
  -- attempt is silently ignored, so this RPC can never touch an EXAM clock.
  IF v_intent <> 'STUDY' OR v_mode <> 'TIMED_FREE_NAV' THEN
    RETURN;
  END IF;

  -- An engagement attempt is always timed (duration set at creation by
  -- _nclex_set_attempt_duration_default). Defensive: bail if somehow null.
  IF v_duration IS NULL THEN
    RETURN;
  END IF;

  -- Clamp to the budget, then move forward only.
  v_value := LEAST(p_engaged_seconds, v_duration);

  UPDATE nclex_attempts
  SET engaged_seconds_used = GREATEST(COALESCE(engaged_seconds_used, 0), v_value),
      last_activity_at     = NOW(),
      updated_at           = NOW()
  WHERE attempt_id = p_attempt_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION nclex_record_engaged_time(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION nclex_record_engaged_time(UUID, INTEGER) TO authenticated;
