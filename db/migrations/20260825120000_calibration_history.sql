-- ─────────────────────────────────────────────────────────────────────
-- CAT Slice 10c — finish the calibration audit table, and add the switch
-- ─────────────────────────────────────────────────────────────────────
-- The audit table itself is NOT created here. `nclex_bank_item_calibration_
-- history` has existed since CAT Slice 1 (20260808120000, §12.7.5), built
-- ahead of the job that would fill it and empty ever since — zero rows on
-- dev and zero on prod, both verified before writing this.
--
-- ⚠ It is easy to arrive at this slice holding §17.2's column list and
-- create a second table. §17.2 sketched `item_id` / `previous_value` /
-- `new_value` / `response_count` / `calibrated_at`; the table that exists
-- uses `bank_item_id` / `previous_difficulty_irt` / `new_difficulty_irt` /
-- `responses_used` / `recalibrated_at`. The doc settles which wins: where
-- §12.7 diverges from §17.2 on audit-table column names, §12.7 is canonical.
-- So this migration adapts to the built table rather than the sketch.
--
-- Three additions, all additive:
--   1. raw_empirical_value — §17.2 asked for it, §12.7.5 did not build it.
--   2. job_trigger + job_triggered_by — who or what started the run.
--   3. the cat_recalibration_enabled switch in nclex_config.

-- ── 1. the unblended measurement ─────────────────────────────────────
-- The stored difficulty is a 70/30 blend (§5.3.3), so a mild-looking move
-- can be hiding a wild measurement: a jump from 0.0 to 0.49 reads the same
-- whether the week measured 0.7 or something far stranger that the blend
-- absorbed. Without the raw figure a suspicious value cannot be traced back
-- to what was actually observed, only to what was kept — and the blend is
-- precisely the thing you would want to check.
--
-- NOT NULL rather than nullable: the job always computes it, and a nullable
-- column here would let a future writer quietly omit the one number that
-- makes the rest auditable. Safe to declare outright because both databases
-- hold zero rows.

ALTER TABLE nclex_bank_item_calibration_history
  ADD COLUMN raw_empirical_value NUMERIC NOT NULL;

COMMENT ON COLUMN nclex_bank_item_calibration_history.raw_empirical_value IS
  'The unblended estimate the fit produced, before the 70/30 dampening in '
  '§5.3.3. new_difficulty_irt is what was stored; this is what was measured.';

-- ── 2. what started the run ──────────────────────────────────────────
-- §5.3.2 gives recalibration two ways in: the weekly schedule, and a manual
-- trigger for testing and edge cases. A row that cannot say which one wrote
-- it makes "why did this item move on a Tuesday" unanswerable.
--
-- `recalibration_job_run_id` already groups the rows of one run; these say
-- what KIND of run it was and, for a manual one, who asked for it. The
-- manual trigger itself is a later slice — the columns land now so that
-- slice is a button rather than a button and a migration.

ALTER TABLE nclex_bank_item_calibration_history
  ADD COLUMN job_trigger      TEXT NOT NULL CHECK (job_trigger IN ('CRON', 'MANUAL')),
  ADD COLUMN job_triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN nclex_bank_item_calibration_history.job_triggered_by IS
  'NULL for a scheduled run; the admin user_id for a manual one (§5.3.2).';

-- ⓘ Not tightened on purpose: `new_source` still accepts CURATOR_LABEL,
-- though §5.2 says recalibration never writes back to it. The rule is
-- enforced in lib/calibration/rules.ts, which only ever emits EMPIRICAL and
-- is tested for it. Narrowing a CHECK that §12.7.5 chose deliberately is a
-- change to a canonical schema, and it is not this slice's call to make.

-- ── 3. the off-switch ────────────────────────────────────────────────
-- Same shape as enrolment_sweep_enabled (20260608120000): the schedule
-- always fires, and the job reads this first. Only the literal 'false'
-- disables it, so a missing row still runs.
--
-- Shipped ON. The job is self-gating — nothing is recalibrated until an item
-- has 30 answers, and the best-covered question in the bank has 4 — so it
-- cannot do anything before real students arrive. Shipping it off would mean
-- remembering to switch it on at launch, which is exactly the kind of thing
-- remembered only once the difficulty numbers are visibly wrong. The switch
-- exists for the day a run needs stopping, not for the wait.

INSERT INTO nclex_config (key, value, description)
VALUES (
  'cat_recalibration_enabled',
  'true',
  'Weekly empirical difficulty recalibration (CAT §5.3). Off stops the job writing; difficulty stays at its last value.'
)
ON CONFLICT (key) DO NOTHING;

-- ── 4. applying a run, atomically ────────────────────────────────────
-- Every item a run changes needs TWO writes: the new difficulty on the bank
-- row, and the history row explaining it. Those must not come apart. A crash
-- between them leaves a difficulty nobody can account for — the one thing
-- the audit table exists to prevent — and the Supabase client cannot span
-- statements in a transaction, so a loop of updates from the job could stop
-- anywhere.
--
-- One call, one transaction, the whole run: either every item moves and every
-- move is recorded, or nothing happened and next Sunday tries again.
--
-- The payload is the plan `lib/calibration/rules.ts` produced. The function
-- deliberately does no arithmetic of its own — no threshold, no blend. Those
-- rules live in one tested place, and a second copy here would be a second
-- thing to keep in step.

CREATE OR REPLACE FUNCTION nclex_apply_calibration(
  p_run_id       TEXT,
  p_trigger      TEXT,
  p_triggered_by UUID,
  p_rows         JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_applied INTEGER := 0;
BEGIN
  -- The job runs as the service role, which bypasses RLS; a curator may also
  -- reach this through the manual trigger (§5.3.2). Nobody else writes
  -- difficulty in bulk.
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT nclex_user_has_permission('BANK_CURATE') THEN
    RAISE EXCEPTION 'not authorised to apply a calibration run'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_trigger NOT IN ('CRON', 'MANUAL') THEN
    RAISE EXCEPTION 'job_trigger must be CRON or MANUAL, got %', p_trigger;
  END IF;

  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset(p_rows) AS r(
      item_id             TEXT,
      new_value           NUMERIC,
      raw_empirical_value NUMERIC,
      previous_value      NUMERIC,
      previous_source     TEXT,
      response_count      INTEGER
    )
  ),
  -- Only rows that still exist in the bank. An item deleted between the read
  -- and the write is skipped rather than failing the run.
  live AS (
    SELECT i.* FROM incoming i
    JOIN nclex_bank_items b ON b.item_id = i.item_id
  ),
  updated AS (
    UPDATE nclex_bank_items b
       SET difficulty_irt    = l.new_value,
           difficulty_source = 'EMPIRICAL',
           updated_at        = NOW()
      FROM live l
     WHERE b.item_id = l.item_id
    RETURNING b.item_id
  ),
  logged AS (
    INSERT INTO nclex_bank_item_calibration_history (
      bank_item_id, previous_difficulty_irt, new_difficulty_irt,
      raw_empirical_value, previous_source, new_source, responses_used,
      recalibration_job_run_id, job_trigger, job_triggered_by
    )
    SELECT l.item_id, l.previous_value, l.new_value,
           l.raw_empirical_value, l.previous_source, 'EMPIRICAL', l.response_count,
           p_run_id, p_trigger, p_triggered_by
      FROM live l
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_applied FROM logged;

  RETURN v_applied;
END;
$$;

COMMENT ON FUNCTION nclex_apply_calibration(TEXT, TEXT, UUID, JSONB) IS
  'Applies one recalibration run in a single transaction: the new difficulty '
  'on each bank row and the history row explaining it, together or not at '
  'all. Does no arithmetic — the threshold and the 70/30 blend live in '
  'lib/calibration/rules.ts.';

REVOKE ALL ON FUNCTION nclex_apply_calibration(TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nclex_apply_calibration(TEXT, TEXT, UUID, JSONB) TO authenticated, service_role;

-- ── on the absence of a job-run table (§17.3) ────────────────────────
-- §17.3 rejected a separate run table on the grounds that a run summary can
-- be grouped out of this one. That holds for a run that changed something.
-- It does not hold for a run that changed nothing — which is EVERY run until
-- real students arrive. Those write zero rows and leave no trace here at
-- all, so "did it run, was it healthy" is answerable from the GitHub Actions
-- run log rather than from our own data. Recorded as accepted, not solved.
