-- =========================================================
-- MyNclex — Slice 4.5a: Preserve answer_changes_json on submit
-- File: mynclex/db/migrations/20260509130000_slice_4_5a_submit_answer_preserve_changes_log.sql
-- =========================================================
-- Bug surfaced while wiring universal save-on-tap (slice 4.5a):
--
-- The slice 2.3 nclex_submit_answer RPC accepts p_answer_changes_json
-- as a parameter (default '[]'::jsonb) and OVERWRITES the row's
-- answer_changes_json column on the DRAFT-promotion UPDATE path. Pre-
-- 4.5a, no DRAFT rows existed (save_progress wasn't built yet), so the
-- overwrite was a no-op — the column was always being written from a
-- caller that had nothing to preserve.
--
-- With 4.5a, save-on-tap writes the row as DRAFT with a populated
-- answer_changes_json (one {at, from, to} entry per material change).
-- When submit_answer fires at Submit click and takes the DRAFT-
-- promotion path, the default-empty p_answer_changes_json was wiping
-- the log we'd just built up.
--
-- Fix: drop p_answer_changes_json from the function signature, and on
-- the DRAFT-promotion UPDATE path, leave answer_changes_json alone
-- (it stays whatever save_progress wrote). On the INSERT path (rare —
-- only fires when submit happens without any prior save-on-tap, e.g.
-- a SATA submitted with zero selections that never triggered a save),
-- the column gets the column default '[]'::jsonb. That matches the
-- pre-4.5a behaviour for direct-submit attempts.
--
-- Also drop the obsolete p_time_spent_sec parameter — it's been NULL
-- for every caller since slice 4.1 shipped (the runner doesn't track
-- per-question time-spent at submit; that comes from per-Q
-- submitted_at deltas in analytics later, parent §14). Trimming it
-- now keeps the surface honest.
--
-- Source of truth:
--   docs/product-plan/bank-consumption-runner.html §9.1, §13
--   docs/product-plan/bank-consumption-attempt-creation.html §6.3.3

-- Drop the old signature first — pg requires explicit drop when
-- changing parameter list.
DROP FUNCTION IF EXISTS nclex_submit_answer(
  UUID, JSONB, NUMERIC, BOOLEAN, INTEGER, TEXT, JSONB
);

CREATE FUNCTION nclex_submit_answer(
  p_attempt_item_id   UUID,
  p_answer_json       JSONB,
  p_score_awarded     NUMERIC,
  p_is_correct        BOOLEAN,
  p_submission_status TEXT DEFAULT 'SUBMITTED'
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

  IF p_score_awarded IS NULL OR p_score_awarded < 0 OR p_score_awarded > v_marks_max THEN
    RAISE EXCEPTION 'score_awarded % out of range [0, %]', p_score_awarded, v_marks_max;
  END IF;

  SELECT submission_status INTO v_existing
  FROM nclex_attempt_answers
  WHERE attempt_item_id = p_attempt_item_id;

  IF v_existing IS NULL THEN
    -- Direct-submit path (no save-on-tap fired first). Rare in 4.5a +;
    -- happens only when the per-type runner submits without a material
    -- change phase (e.g. SATA / HIGHLIGHT submitted with zero selections
    -- straight from the empty initial state). answer_changes_json takes
    -- the column default '[]'::jsonb — there are no changes to log.
    INSERT INTO nclex_attempt_answers (
      attempt_item_id, attempt_id, student_id,
      answer_json,     submission_status,
      is_correct,      score_awarded,
      submitted_at
    ) VALUES (
      p_attempt_item_id, v_attempt_id, v_owner,
      p_answer_json,     p_submission_status,
      p_is_correct,      p_score_awarded,
      NOW()
    );

  ELSIF v_existing = 'DRAFT' THEN
    -- Promotion path: a save-on-tap DRAFT becomes the final submission.
    -- answer_changes_json is NOT touched here — it stays whatever
    -- save_progress wrote (one entry per material change). answer_json
    -- gets the final committed value from the caller, which should
    -- match the most recent save-on-tap value but is re-asserted in
    -- case of any client-side debounce race.
    UPDATE nclex_attempt_answers
    SET answer_json       = p_answer_json,
        submission_status = p_submission_status,
        is_correct        = p_is_correct,
        score_awarded     = p_score_awarded,
        submitted_at      = NOW(),
        updated_at        = NOW()
    WHERE attempt_item_id = p_attempt_item_id;

  ELSE
    RAISE EXCEPTION 'answer already %, cannot resubmit', v_existing;
  END IF;

  UPDATE nclex_attempts
  SET last_activity_at = NOW(),
      updated_at       = NOW()
  WHERE attempt_id = v_attempt_id;
END;
$$;


-- =========================================================
-- Grants — same as the slice 2.3 original.
-- =========================================================
REVOKE EXECUTE ON FUNCTION nclex_submit_answer(UUID, JSONB, NUMERIC, BOOLEAN, TEXT)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION nclex_submit_answer(UUID, JSONB, NUMERIC, BOOLEAN, TEXT)
  TO authenticated;
