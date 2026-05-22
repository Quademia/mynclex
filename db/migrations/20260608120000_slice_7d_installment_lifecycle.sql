-- =========================================================
-- MyNclex — Payments Slice 7d: installments lifecycle
-- File: mynclex/db/migrations/20260608120000_slice_7d_installment_lifecycle.sql
-- =========================================================
-- Adds the recurring side of payment plans:
--   1. enrolment_sweep_enabled config flag (default ON; super-admin off-switch).
--   2. A guard so the same installment can't be settled twice.
--   3. Access-window enforcement folded into the active-enrolment helpers
--      (so an enrolment past its window loses access at READ time, before the
--      nightly sweep flips the stored status — the sweep makes the status
--      truthful, the read gate makes access truthful).
--   4. nclex_enrolment_nightly_sweep(): ENROLLED→PAUSED on overdue
--      installment/balance, ENROLLED/PAUSED→EXPIRED past the access window,
--      and ACTIVE bank subscriptions→EXPIRED past end_at.
--   5. pg_cron schedule, nightly at 02:00 UTC.
--
-- Source of truth:
--   docs/product-plan/payments-and-enrolment.md
--     · "Settled 2026-05-22 — Slice 7 build decisions"  (due-date model,
--        anchor = enrolment date, overdue → PAUSED, no v1 reminder emails)
--     · "Enrolment row lifecycle"  (PAUSED / EXPIRED transitions, paused_reason)
--   docs/product-plan/design-handoff/payments-and-enrolment/index.html §11
--     · nclex_enrolment_nightly_sweep() + cron.schedule('...', '0 2 * * *', ...)
--
-- Due-date arithmetic MIRRORS lib/payments/schedule.ts (buildSchedule). The
-- two must stay in lockstep — see that file's header. Position 1 is the
-- initial payment (PROGRAMME_INITIAL, installment_index NULL); positions 2..N
-- are PROGRAMME_INSTALLMENT rows carrying their position. "Paid so far" is the
-- count of PAID/ACTIVATED programme payment rows for the enrolment.
--
-- Status flips here are direct UPDATEs, not the auth-gated transition RPCs
-- (nclex_pause_enrolment et al require auth.uid() and hardcode TUTOR_MANUAL).
-- The sweep is the single auditable home for the SYSTEM transitions, the way
-- those RPCs are the home for USER-initiated ones (handoff §11 RLS pattern).
--
-- Mirrored into db/rls.sql (helper functions).


-- =========================================================
-- 1. Sweep on/off flag (default ON)
-- =========================================================
-- Read at the top of the sweep. Only the literal 'false' disables it, so a
-- missing row still runs (fail-on). Super admin flips it to 'false' to pause
-- the automation; the read-time access gate (section 3) is unaffected.

INSERT INTO nclex_config (key, value)
VALUES ('enrolment_sweep_enabled', 'true')
ON CONFLICT (key) DO NOTHING;


-- =========================================================
-- 2. One-settled-payment-per-position guard
-- =========================================================
-- A double-click or a retried callback must not settle the same installment
-- twice. Two INIT rows for one position are fine (abandoned attempts); two
-- PAID/ACTIVATED rows are not.

CREATE UNIQUE INDEX IF NOT EXISTS idx_nclex_payments_one_settled_installment
  ON nclex_payments (enrolment_id, installment_index)
  WHERE purpose = 'PROGRAMME_INSTALLMENT' AND status IN ('PAID', 'ACTIVATED');


-- =========================================================
-- 3. Access window in the active-enrolment helpers
-- =========================================================
-- These gate every content read (units / blocks / activities / quizzes) and
-- the launch RPCs. Adding the window check makes a past-window enrolment lose
-- access immediately, independent of whether the nightly EXPIRED sweep has run
-- yet. Overdue-installment access is NOT inlined here (it stays the sweep's
-- job, per handoff §11) — that would put a per-read schedule computation on a
-- hot RLS path.

CREATE OR REPLACE FUNCTION nclex_has_active_programme_enrolment(p_programme_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM nclex_enrolments e
    WHERE e.programme_id = p_programme_id
      AND e.user_id = auth.uid()
      AND e.status = 'ENROLLED'
      AND (e.access_expires_at IS NULL OR e.access_expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION nclex_has_active_cohort_enrolment(p_cohort_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM nclex_enrolments e
    WHERE e.cohort_id = p_cohort_id
      AND e.user_id = auth.uid()
      AND e.status = 'ENROLLED'
      AND (e.access_expires_at IS NULL OR e.access_expires_at > NOW())
  );
$$;


-- =========================================================
-- 4. The nightly sweep
-- =========================================================

CREATE OR REPLACE FUNCTION nclex_enrolment_nightly_sweep()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Off-switch. Only an explicit 'false' disables; missing/anything-else runs.
  IF COALESCE(
       (SELECT value FROM nclex_config WHERE key = 'enrolment_sweep_enabled'),
       'true'
     ) = 'false' THEN
    RETURN;
  END IF;

  -- 4a. ENROLLED → PAUSED when the next unpaid installment/balance is overdue.
  --     UPFRONT_FULL has no later positions, so it's excluded by the kind
  --     filter. Mirrors lib/payments/schedule.ts.
  UPDATE nclex_enrolments e
  SET status = 'PAUSED', paused_at = NOW(), paused_reason = 'INSTALLMENT_OVERDUE',
      updated_at = NOW()
  WHERE e.status = 'ENROLLED'
    AND e.strategy_snapshot_json IS NOT NULL
    AND (e.strategy_snapshot_json->>'kind') IN ('DEPOSIT_BALANCE', 'EQUAL_INSTALLMENTS')
    AND e.enrolment_id IN (
      SELECT d.enrolment_id
      FROM (
        SELECT
          e2.enrolment_id,
          e2.enrolled_at AS anchor,
          (e2.strategy_snapshot_json->>'kind') AS kind,
          COALESCE(pp.paid, 0) AS paid,
          CASE (e2.strategy_snapshot_json->>'kind')
            WHEN 'DEPOSIT_BALANCE'    THEN 2
            WHEN 'EQUAL_INSTALLMENTS' THEN (e2.strategy_snapshot_json->>'installment_count')::int
          END AS total,
          NULLIF(e2.strategy_snapshot_json->>'installment_interval_days', '')::int AS interval_days,
          NULLIF(e2.strategy_snapshot_json->>'balance_due_days_after_enrolment', '')::int AS balance_days
        FROM nclex_enrolments e2
        LEFT JOIN (
          SELECT enrolment_id, COUNT(*) AS paid
          FROM nclex_payments
          WHERE purpose IN ('PROGRAMME_INITIAL', 'PROGRAMME_INSTALLMENT')
            AND status IN ('PAID', 'ACTIVATED')
            AND enrolment_id IS NOT NULL
          GROUP BY enrolment_id
        ) pp ON pp.enrolment_id = e2.enrolment_id
        WHERE e2.status = 'ENROLLED'
          AND e2.strategy_snapshot_json IS NOT NULL
          AND (e2.strategy_snapshot_json->>'kind') IN ('DEPOSIT_BALANCE', 'EQUAL_INSTALLMENTS')
      ) d
      WHERE d.paid < d.total
        AND (
          CASE d.kind
            -- Next unpaid is the balance (position 2), due anchor + N days.
            WHEN 'DEPOSIT_BALANCE'
              THEN d.anchor + (COALESCE(d.balance_days, 0) || ' days')::interval
            -- Next unpaid is position paid+1, due anchor + paid*interval.
            ELSE d.anchor + (d.paid * COALESCE(d.interval_days, 0) || ' days')::interval
          END
        ) < NOW()
    );

  -- 4b. ENROLLED / PAUSED → EXPIRED when the access window has ended.
  UPDATE nclex_enrolments
  SET status = 'EXPIRED', terminal_at = NOW(), updated_at = NOW()
  WHERE status IN ('ENROLLED', 'PAUSED')
    AND access_expires_at IS NOT NULL
    AND access_expires_at < NOW();

  -- 4c. ACTIVE bank/readiness subscriptions → EXPIRED past end_at. (Readiness
  --     packs have NULL end_at = no expiry; they're skipped.)
  UPDATE nclex_subscriptions
  SET status = 'EXPIRED', updated_at = NOW()
  WHERE status = 'ACTIVE'
    AND end_at IS NOT NULL
    AND end_at < NOW();
END;
$$;

-- Only the cron job (postgres) runs this. Keep it off the API roles.
REVOKE EXECUTE ON FUNCTION nclex_enrolment_nightly_sweep() FROM PUBLIC, anon, authenticated;


-- =========================================================
-- 5. Schedule it nightly at 02:00 UTC
-- =========================================================
-- pg_cron lives in the `cron` schema. The named overload upserts by job name,
-- so re-running this migration just refreshes the schedule.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'nclex-enrolment-nightly',
  '0 2 * * *',
  $cron$ SELECT public.nclex_enrolment_nightly_sweep(); $cron$
);
