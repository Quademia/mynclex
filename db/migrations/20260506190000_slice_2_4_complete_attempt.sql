-- =========================================================
-- MyNclex — Slice 2.4 (partial): Complete-attempt RPC
-- File: mynclex/db/migrations/20260506190000_slice_2_4_complete_attempt.sql
-- =========================================================
-- Terminal transition for an IN_PROGRESS attempt: aggregate the per-item
-- scores, store the attempt-level final_score, flip status to COMPLETED.
--
-- The two sweeps that flip stuck attempts (`nclex_timeout_sweep`,
-- `nclex_orphan_cleanup` from BUILD_LIST.md slice 2.4) live in their own
-- later migration — this slice only handles the student-initiated
-- "Finish quiz" path that the runner calls.
--
-- Final-score formula: item-equivalent average per
-- `bank-marks-and-scoring.html` §7. Each delivered item contributes
-- equally: sum (score_awarded ?? 0) / marks_snapshot, then divide by
-- the item count. Unanswered items contribute 0/marks = 0 (correct
-- per planning — "unanswered counts as wrong").
--
-- Idempotent: if the attempt is already in a terminal state, return
-- the stored final_score unchanged. Two clients clicking "Finish" at
-- the same time can't double-finalise.
--
-- Source of truth:
--   docs/product-plan/bank-marks-and-scoring.html §7 (final_score column),
--   docs/product-plan/bank-consumption-attempt-creation.html §6.1.3.
CREATE OR REPLACE FUNCTION nclex_complete_attempt(p_attempt_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student      UUID := auth.uid();
  v_owner        UUID;
  v_status       TEXT;
  v_existing_fs  NUMERIC;
  v_final_score  NUMERIC;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT student_id, status, final_score
  INTO   v_owner,    v_status, v_existing_fs
  FROM nclex_attempts
  WHERE attempt_id = p_attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt not found: %', p_attempt_id;
  END IF;

  IF v_owner <> v_student AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'not your attempt';
  END IF;

  -- Already terminal: idempotent, return whatever is stored.
  IF v_status <> 'IN_PROGRESS' THEN
    RETURN v_existing_fs;
  END IF;

  -- Item-equivalent average. LEFT JOIN so unanswered items contribute 0.
  SELECT AVG(COALESCE(ans.score_awarded, 0) / i.marks_snapshot)
  INTO v_final_score
  FROM nclex_attempt_items i
  LEFT JOIN nclex_attempt_answers ans
    ON ans.attempt_item_id = i.attempt_item_id
  WHERE i.attempt_id = p_attempt_id;

  -- Defensive — create_attempt validates a non-empty pool, so an attempt
  -- with zero items shouldn't exist. Treat as 0 rather than NULL if it
  -- ever happens.
  IF v_final_score IS NULL THEN
    v_final_score := 0;
  END IF;

  UPDATE nclex_attempts
  SET status      = 'COMPLETED',
      ended_at    = NOW(),
      final_score = v_final_score,
      updated_at  = NOW()
  WHERE attempt_id = p_attempt_id;

  RETURN v_final_score;
END;
$$;


-- =========================================================
-- Grants
-- =========================================================
REVOKE EXECUTE ON FUNCTION nclex_complete_attempt(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION nclex_complete_attempt(UUID) TO authenticated;
