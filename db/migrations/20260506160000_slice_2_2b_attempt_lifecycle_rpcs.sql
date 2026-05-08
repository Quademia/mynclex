-- =========================================================
-- MyNclex — Slice 2.2b: Attempt-lifecycle RPCs
-- File: mynclex/db/migrations/20260506160000_slice_2_2b_attempt_lifecycle_rpcs.sql
-- =========================================================
-- The two small lifecycle RPCs sitting on top of the create-attempt
-- path from slice 2.2a:
--
--   • nclex_mark_attempt_started — preflight Start click. Sets
--     started_at = NOW() if not already set. Idempotent: re-calling
--     after the timer is running is a no-op (returns the existing
--     started_at unchanged).
--   • nclex_discard_attempt — student backs out. Flips status to
--     ABANDONED, sets ended_at, and hard-deletes the snapshot child
--     rows per planning §6.3.1 ("discard is hard-delete, no forensics").
--
-- Both check ownership against auth.uid() — only the owning student
-- (or SUPER_ADMIN) can mutate an attempt. SUPER_ADMIN is allowed for
-- support-action workflows; ownership rule is the primary path.
--
-- Source of truth:
--   docs/product-plan/bank-consumption-attempt-creation.html §10.1, §6.3.1


-- =========================================================
-- nclex_mark_attempt_started
-- =========================================================
-- Sets started_at = NOW() the first time it's called for this attempt.
-- Subsequent calls are no-ops. Returns the started_at value that ends
-- up on the row (whether just set or pre-existing).
--
-- Why idempotent: the runner could re-fire this on a retry after a
-- network blip; the preflight UX could call it on mount of Q1; etc.
-- The timer must anchor to the *first* successful call, never reset.
CREATE OR REPLACE FUNCTION nclex_mark_attempt_started(p_attempt_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student   UUID := auth.uid();
  v_owner     UUID;
  v_status    TEXT;
  v_started   TIMESTAMPTZ;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT student_id, status, started_at
  INTO v_owner, v_status, v_started
  FROM nclex_attempts
  WHERE attempt_id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt not found: %', p_attempt_id;
  END IF;

  -- Ownership: owner OR SUPER_ADMIN
  IF v_owner <> v_student AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your attempt';
  END IF;

  -- Don't restart a terminated attempt
  IF v_status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'attempt is %, cannot start', v_status;
  END IF;

  -- Already started — return existing timestamp unchanged
  IF v_started IS NOT NULL THEN
    RETURN v_started;
  END IF;

  UPDATE nclex_attempts
  SET started_at       = NOW(),
      last_activity_at = NOW(),
      updated_at       = NOW()
  WHERE attempt_id = p_attempt_id
  RETURNING started_at INTO v_started;

  RETURN v_started;
END;
$$;


-- =========================================================
-- nclex_discard_attempt
-- =========================================================
-- Student-initiated discard. Flips status to ABANDONED, sets ended_at,
-- and hard-deletes the snapshot rows (items, case snapshots, trend
-- snapshots, answers — all wired ON DELETE CASCADE from the attempt
-- root, but item/snapshot deletion is explicit here for clarity).
--
-- Per planning §6.3.1: "Explicit student-initiated discard hard-deletes
-- the rows rather than soft-marking — discard is the equivalent of
-- 'never mind, throw this away'." We keep the parent nclex_attempts row
-- so history pages can show "ABANDONED at <timestamp>" if useful, but
-- the question-level data is gone.
--
-- The auto-expiry sweeps (orphan + EXAM-timeout) live in slice 2.4.
-- This RPC only handles the "student tapped Discard in the UI" path.
CREATE OR REPLACE FUNCTION nclex_discard_attempt(p_attempt_id UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student UUID := auth.uid();
  v_owner   UUID;
  v_status  TEXT;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT student_id, status
  INTO v_owner, v_status
  FROM nclex_attempts
  WHERE attempt_id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt not found: %', p_attempt_id;
  END IF;

  IF v_owner <> v_student AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your attempt';
  END IF;

  -- Already terminated: no-op (idempotent for client retries)
  IF v_status <> 'IN_PROGRESS' THEN
    RETURN;
  END IF;

  -- Hard-delete child rows (snapshots + items + answers).
  -- nclex_attempt_answers has FK ON DELETE CASCADE from items, so the
  -- items DELETE cascades through. case + trend snapshots hang off the
  -- attempt directly via FK ON DELETE CASCADE — explicit DELETEs here
  -- to make the discard semantics obvious in this function body.
  DELETE FROM nclex_attempt_items           WHERE attempt_id = p_attempt_id;
  DELETE FROM nclex_attempt_case_snapshots  WHERE attempt_id = p_attempt_id;
  DELETE FROM nclex_attempt_trend_snapshots WHERE attempt_id = p_attempt_id;

  UPDATE nclex_attempts
  SET status     = 'ABANDONED',
      ended_at   = NOW(),
      updated_at = NOW()
  WHERE attempt_id = p_attempt_id;
END;
$$;


-- =========================================================
-- Grants — restrict to authenticated only. See 2.2a header for why
-- PUBLIC + anon must both be explicitly revoked on Supabase.
-- =========================================================
REVOKE EXECUTE ON FUNCTION nclex_mark_attempt_started(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION nclex_discard_attempt(UUID)      FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION nclex_mark_attempt_started(UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION nclex_discard_attempt(UUID)       TO authenticated;
