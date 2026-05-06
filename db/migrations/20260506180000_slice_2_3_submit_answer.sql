-- =========================================================
-- MyNclex — Slice 2.3: Submit-answer RPC
-- File: mynclex/db/migrations/20260506180000_slice_2_3_submit_answer.sql
-- =========================================================
-- Persists a student's answer to one delivered question item.
--
-- Scoring is NOT done here — the calling Server Action runs
-- `scoreAttempt()` from `lib/scoring/` (TS, see slice 2.5a) against the
-- snapshot key it read server-side, then passes the resulting
-- score_awarded + is_correct into this RPC. Keeping scoring in TS makes
-- `lib/scoring/` the single source of truth (40 Vitest cases) instead
-- of duplicating per-type math in PL/pgSQL.
--
-- The Pillar 2 (no answer-key leakage) seal is enforced at the page-load
-- boundary in `app/(app)/(focused)/session/[attempt_id]/page.tsx`: live-
-- mode page projection omits `correct_answer_snapshot_json` /
-- `rationale_snapshot` / `rationale_img_snapshot`. The submit-answer
-- Server Action is the only path that reads them (server-side, never
-- forwarded to the browser unless the per-Q submit policy allows it,
-- per runner.html §2.3.1).
--
-- Existing-row handling:
--   • no row yet     → INSERT a SUBMITTED (or AUTO_SUBMITTED / SKIPPED) row
--   • DRAFT row      → UPDATE in place (promotion path used by save-progress
--                      in slice 4.6; not exercised in 4.1)
--   • already final  → RAISE (UL re-submit lock per runner.html §16.4;
--                      timed modes' batched submit also writes once)
--
-- Source of truth:
--   docs/product-plan/bank-consumption-runner.html §2.3, §10, §16.4
--   docs/product-plan/bank-consumption-attempt-creation.html §6.3, §6.3.1
--   docs/product-plan/bank-marks-and-scoring.html §5–§7
CREATE OR REPLACE FUNCTION nclex_submit_answer(
  p_attempt_item_id     UUID,
  p_answer_json         JSONB,
  p_score_awarded       NUMERIC,
  p_is_correct          BOOLEAN,
  p_time_spent_sec      INTEGER DEFAULT NULL,
  p_submission_status   TEXT    DEFAULT 'SUBMITTED',
  p_answer_changes_json JSONB   DEFAULT '[]'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student     UUID := auth.uid();
  v_attempt_id  UUID;
  v_owner       UUID;
  v_status      TEXT;
  v_marks_max   NUMERIC;
  v_existing    TEXT;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_submission_status NOT IN ('SUBMITTED', 'AUTO_SUBMITTED', 'SKIPPED') THEN
    RAISE EXCEPTION 'invalid submission_status %; expected SUBMITTED / AUTO_SUBMITTED / SKIPPED',
      p_submission_status;
  END IF;

  -- Resolve the attempt + item in one go. The snapshot owns marks_max
  -- (so a curator editing the live bank later can't change the ceiling
  -- on this attempt's row).
  SELECT i.attempt_id, a.student_id, a.status, i.marks_snapshot
  INTO   v_attempt_id, v_owner,     v_status, v_marks_max
  FROM nclex_attempt_items i
  JOIN nclex_attempts      a USING (attempt_id)
  WHERE i.attempt_item_id = p_attempt_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt item not found: %', p_attempt_item_id;
  END IF;

  IF v_owner <> v_student AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your attempt';
  END IF;

  IF v_status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'attempt is %, cannot submit', v_status;
  END IF;

  -- Defensive: TS-side scoring should never violate, but server enforces
  -- the bound anyway as a sanity check on the wire.
  IF p_score_awarded IS NULL OR p_score_awarded < 0 OR p_score_awarded > v_marks_max THEN
    RAISE EXCEPTION 'score_awarded % out of range [0, %]', p_score_awarded, v_marks_max;
  END IF;

  -- Existing-row handling. UNIQUE on attempt_item_id means at most one row.
  SELECT submission_status INTO v_existing
  FROM nclex_attempt_answers
  WHERE attempt_item_id = p_attempt_item_id;

  IF v_existing IS NULL THEN
    INSERT INTO nclex_attempt_answers (
      attempt_item_id, attempt_id, student_id,
      answer_json,     submission_status,
      is_correct,      score_awarded, time_spent_sec,
      answer_changes_json, submitted_at
    ) VALUES (
      p_attempt_item_id, v_attempt_id, v_owner,
      p_answer_json,     p_submission_status,
      p_is_correct,      p_score_awarded, p_time_spent_sec,
      p_answer_changes_json, NOW()
    );

  ELSIF v_existing = 'DRAFT' THEN
    -- Promotion path: a save-progress draft becomes a real submit. Used by
    -- slice 4.6's Resume flow; in 4.1 there are no DRAFT rows yet.
    UPDATE nclex_attempt_answers
    SET answer_json         = p_answer_json,
        submission_status   = p_submission_status,
        is_correct          = p_is_correct,
        score_awarded       = p_score_awarded,
        time_spent_sec      = p_time_spent_sec,
        answer_changes_json = p_answer_changes_json,
        submitted_at        = NOW(),
        updated_at          = NOW()
    WHERE attempt_item_id = p_attempt_item_id;

  ELSE
    -- SUBMITTED / AUTO_SUBMITTED / SKIPPED — already final.
    RAISE EXCEPTION 'answer already %, cannot resubmit', v_existing;
  END IF;

  -- Heartbeat. last_activity_at drives engagement-clock + orphan-cleanup
  -- (attempt-creation §6.1, §10.2).
  UPDATE nclex_attempts
  SET last_activity_at = NOW(),
      updated_at       = NOW()
  WHERE attempt_id = v_attempt_id;
END;
$$;


-- =========================================================
-- Grants — see slice 2.2a header for why PUBLIC + anon must both be
-- explicitly revoked on Supabase.
-- =========================================================
REVOKE EXECUTE ON FUNCTION nclex_submit_answer(UUID, JSONB, NUMERIC, BOOLEAN, INTEGER, TEXT, JSONB)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION nclex_submit_answer(UUID, JSONB, NUMERIC, BOOLEAN, INTEGER, TEXT, JSONB)
  TO authenticated;
