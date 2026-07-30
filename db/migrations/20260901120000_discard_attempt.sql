-- ─────────────────────────────────────────────────────────────────────
-- Discard an unfinished practice sitting
-- ─────────────────────────────────────────────────────────────────────
-- Nothing in the product has ever written status = 'ABANDONED', even
-- though the value has existed since the attempts table was created. The
-- consequence is visible: on dev one student carries 36 unfinished
-- sittings, none of which can ever be cleared, and the History page's
-- "Discarded" filter matches zero rows by construction.
--
-- WHY A FUNCTION AND NOT AN UPDATE FROM THE APP: a student has no UPDATE
-- policy on nclex_attempts at all — only nclex_attempts_self_read. Every
-- attempt mutation in this product already goes through a SECURITY
-- DEFINER function (nclex_complete_attempt, nclex_expire_attempt,
-- nclex_submit_answer, nclex_save_progress). This follows that pattern,
-- which also puts the eligibility rules in the one layer every caller
-- must cross rather than in the page that happens to render the button.
--
-- SCOPE — PRACTICE ONLY, and deliberately so. Measured before writing
-- this: all 36 stale rows on dev are practice quizzes; there are zero
-- unfinished CATs; and the only two unfinished packs are exactly what
-- must be protected.
--   • a READINESS_PACK sitting is a paid, one-shot diagnostic. Throwing
--     one away forfeits the credit, which is far too consequential to
--     sit behind a two-click confirm in a list.
--   • a CAT is an exam with its own lifecycle and its own surface
--     (including an abandoned view on the result page); History is not
--     the place to end one.
--   • a PROGRAMME_ASSIGNED attempt belongs to a tutor's curriculum, not
--     to the student, so it is not theirs to discard. It is also already
--     excluded from this page.
-- Widening this later means relaxing one predicate here, not rewriting
-- the caller.
--
-- WHAT IT DOES NOT DO: it does not touch a single answer row. Submitted
-- answers stay counted in accuracy, progress and analytics. Discarding
-- means "I am not going back to this", not "this never happened" —
-- otherwise a student could discard their way to a better-looking
-- dashboard and every figure on it would stop meaning anything.
--
-- ended_at is deliberately left NULL: the sitting did not end, it was
-- abandoned, and at least one surface (the readiness report) derives a
-- duration from ended_at − started_at. Stamping it would invite a future
-- reader to report "this session took nine days". updated_at carries the
-- when.

CREATE OR REPLACE FUNCTION nclex_discard_attempt(p_attempt_id UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student UUID := auth.uid();
  v_owner   UUID;
  v_source  TEXT;
  v_mode    TEXT;
  v_status  TEXT;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT student_id, source, mode, status
    INTO v_owner, v_source, v_mode, v_status
  FROM nclex_attempts
  WHERE attempt_id = p_attempt_id;

  -- One message for "no such attempt" and "not yours". SECURITY DEFINER
  -- sees every row, so distinguishing them would let a caller probe
  -- whether an arbitrary attempt id exists.
  IF v_owner IS NULL OR v_owner <> v_student THEN
    RAISE EXCEPTION 'session not found';
  END IF;

  IF v_status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'only an unfinished session can be discarded';
  END IF;

  IF v_source <> 'CUSTOM_BUILT' OR v_mode = 'CAT' THEN
    RAISE EXCEPTION 'only a practice session can be discarded';
  END IF;

  UPDATE nclex_attempts
     SET status     = 'ABANDONED',
         updated_at = now()
   WHERE attempt_id = p_attempt_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION nclex_discard_attempt(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION nclex_discard_attempt(UUID) TO authenticated;
