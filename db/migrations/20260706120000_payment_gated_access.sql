-- =========================================================
-- MyNclex — Tutor choice: let payment gate access (per programme)
-- File: mynclex/db/migrations/20260706120000_payment_gated_access.sql
-- =========================================================
-- Today access is coupled to payment: a student on a deposit/installment
-- plan whose next payment goes overdue is PAUSED (loses content access) by
-- the nightly sweep. Good as a default — but some tutors won't want a late
-- payment to lock a student out (trust-based / off-platform arrangements).
--
-- This makes it a per-programme TUTOR CHOICE. The coupling funnels through a
-- single chokepoint — the sweep's ENROLLED->PAUSED step (4a) — so the change
-- targets only that step; the access gate itself (status = 'ENROLLED', RLS)
-- is unchanged.
--
--   • payment_gates_access (default TRUE) on nclex_programmes — TRUE keeps
--     today's behaviour; FALSE means missed payments never pause access on
--     that programme. Money is still tracked (plans, schedules, overdue
--     indicators) — only the enforcement (the pause) is suppressed.
--   • The sweep's pause step now skips enrolments whose programme has the
--     flag off. (The access-window EXPIRED step and the bank-subscription
--     step are untouched — this is about the missed-payment pause only.)
--
-- Turning the flag off ALSO auto-resumes that programme's currently
-- payment-paused students — that's done in the app action
-- (setProgrammePaymentGatingAction), not here, so it can run with the
-- tutor's session + report the affected count. The sweep change below is
-- the going-forward half.
--
-- Source of truth:
--   docs/product-plan/payments-and-enrolment.md
--     · "Settled 2026-06-24 — Tutor choice: let payment gate access"
--
-- The sweep body is reproduced from migration 20260610120000 (the current
-- grace-era version) with ONE new condition added to step 4a — keep the rest
-- in lockstep with lib/payments/schedule.ts. Mirrored into db/schema.sql.


-- =========================================================
-- 1. The per-programme flag (default ON = today's behaviour)
-- =========================================================

ALTER TABLE nclex_programmes
  ADD COLUMN IF NOT EXISTS payment_gates_access BOOLEAN NOT NULL DEFAULT TRUE;


-- =========================================================
-- 2. Re-create the nightly sweep — step 4a skips gating-off programmes
-- =========================================================
-- Identical to 20260610120000 except the one new AND condition in the
-- ENROLLED->PAUSED step, marked below.

CREATE OR REPLACE FUNCTION nclex_enrolment_nightly_sweep()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF COALESCE(
       (SELECT value FROM nclex_config WHERE key = 'enrolment_sweep_enabled'),
       'true'
     ) = 'false' THEN
    RETURN;
  END IF;

  -- ENROLLED -> PAUSED on overdue installment/balance, UNLESS grace is active,
  -- and ONLY for programmes that gate access by payment.
  UPDATE nclex_enrolments e
  SET status = 'PAUSED', paused_at = NOW(), paused_reason = 'INSTALLMENT_OVERDUE',
      updated_at = NOW()
  WHERE e.status = 'ENROLLED'
    AND e.strategy_snapshot_json IS NOT NULL
    AND (e.strategy_snapshot_json->>'kind') IN ('DEPOSIT_BALANCE', 'EQUAL_INSTALLMENTS')
    AND (e.installment_grace_until IS NULL OR e.installment_grace_until < NOW())
    -- NEW (payment-gated access): skip programmes the tutor opted out of.
    AND EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = e.programme_id
        AND p.payment_gates_access = TRUE
    )
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
            WHEN 'DEPOSIT_BALANCE'
              THEN d.anchor + (COALESCE(d.balance_days, 0) || ' days')::interval
            ELSE d.anchor + (d.paid * COALESCE(d.interval_days, 0) || ' days')::interval
          END
        ) < NOW()
    );

  -- ENROLLED / PAUSED -> EXPIRED past the access window. (Unchanged — the
  -- access window is a separate lever from the missed-payment pause.)
  UPDATE nclex_enrolments
  SET status = 'EXPIRED', terminal_at = NOW(), updated_at = NOW()
  WHERE status IN ('ENROLLED', 'PAUSED')
    AND access_expires_at IS NOT NULL
    AND access_expires_at < NOW();

  -- ACTIVE bank/readiness subscriptions -> EXPIRED past end_at. (Unchanged.)
  UPDATE nclex_subscriptions
  SET status = 'EXPIRED', updated_at = NOW()
  WHERE status = 'ACTIVE'
    AND end_at IS NOT NULL
    AND end_at < NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION nclex_enrolment_nightly_sweep() FROM PUBLIC, anon, authenticated;
