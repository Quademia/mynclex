-- =========================================================
-- MyNclex — Enrolment installment grace (7d follow-up)
-- File: mynclex/db/migrations/20260610120000_enrolment_installment_grace.sql
-- =========================================================
-- A tutor needs a way to let an overdue student back in *without* claiming a
-- payment arrived — "give more time" — distinct from "mark paid". Marking
-- paid fabricates money that never reached anyone and wrongly advances the
-- schedule; a bare unpause is futile because the nightly sweep just re-pauses
-- the still-overdue student that night. Grace fixes both: it defers the pause
-- to a later date while the installment stays unpaid (still owed, on-platform).
--
--   • installment_grace_until — the active grace deadline. Overwritten on each
--     grant; the sweep reads it. NULL = no grace.
--   • grace_history_json       — append-only log, one entry per grant:
--     { granted_at, granted_by, days, grace_until }. For the per-student story.
--
-- The sweep's overdue->PAUSED step now skips an enrolment whose grace is still
-- active. Everything else (due-date maths, mark-paid, schedule) is unchanged.

ALTER TABLE nclex_enrolments
  ADD COLUMN installment_grace_until TIMESTAMPTZ,
  ADD COLUMN grace_history_json      JSONB NOT NULL DEFAULT '[]'::jsonb;


-- Re-create the sweep with the grace guard added to the PAUSE step. (Body is
-- identical to migration 20260608120000 except the one new AND condition,
-- marked below.)
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

  -- ENROLLED -> PAUSED on overdue installment/balance, UNLESS grace is active.
  UPDATE nclex_enrolments e
  SET status = 'PAUSED', paused_at = NOW(), paused_reason = 'INSTALLMENT_OVERDUE',
      updated_at = NOW()
  WHERE e.status = 'ENROLLED'
    AND e.strategy_snapshot_json IS NOT NULL
    AND (e.strategy_snapshot_json->>'kind') IN ('DEPOSIT_BALANCE', 'EQUAL_INSTALLMENTS')
    -- NEW (grace): don't pause a student whose grace window hasn't ended.
    AND (e.installment_grace_until IS NULL OR e.installment_grace_until < NOW())
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

  -- ENROLLED / PAUSED -> EXPIRED past the access window.
  UPDATE nclex_enrolments
  SET status = 'EXPIRED', terminal_at = NOW(), updated_at = NOW()
  WHERE status IN ('ENROLLED', 'PAUSED')
    AND access_expires_at IS NOT NULL
    AND access_expires_at < NOW();

  -- ACTIVE bank/readiness subscriptions -> EXPIRED past end_at.
  UPDATE nclex_subscriptions
  SET status = 'EXPIRED', updated_at = NOW()
  WHERE status = 'ACTIVE'
    AND end_at IS NOT NULL
    AND end_at < NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION nclex_enrolment_nightly_sweep() FROM PUBLIC, anon, authenticated;
