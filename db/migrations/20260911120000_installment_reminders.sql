-- =========================================================
-- MyNclex — The sweep starts speaking: payment reminders + the pause notice
-- File: mynclex/db/migrations/20260911120000_installment_reminders.sql
-- =========================================================
-- Slice 1b. Until now the nightly sweep has looked at every student on a
-- payment plan and said NOTHING — the first thing she hears about owing
-- money is her access stopping. It now speaks three times:
--
--   T-7      payment.installment_due       stage '<n>:T-7'       a heads-up
--   T-3      payment.installment_due       stage '<n>:T-3'       the nudge
--   overdue  payment.installment_overdue   stage '<n>:overdue'   it happened
--
-- ⭐ THE RULE THIS IMPLEMENTS (settled 2026-08-12): a scheduled email is a
-- state change, warned or recorded. Warning and pause come from ONE pass over
-- ONE expression, so "your access is paused" reaching somebody who was never
-- warned is structurally impossible rather than merely unlikely.
--
-- ⚠ NOTHING ABOUT WHO GETS PAUSED, OR WHEN, CHANGES HERE. Step 2c is the same
-- rule as migration 20260706120000, reading the shared function instead of an
-- inline copy. Verified before switching: the function and the old inline
-- expression select the same enrolments with the same due dates — 0
-- disagreements across every owing enrolment on dev.
--
-- Source of truth: docs/product-plan/transactional-email.md


-- =========================================================
-- 1. The sum, written once
-- =========================================================
-- ⭐ WHY THIS EXISTS. "When is her next payment due, and how much" was written
-- out THREE times before today: twice inline in the sweep (the pause WHERE and
-- its nested subquery) and again in TypeScript (lib/payments/schedule.ts). The
-- reminders would have made it four. That migration's own header already
-- warned: "a third copy is how that eventually goes wrong." Four copies of the
-- date the warning quotes and the pause enforces is precisely the drift this
-- feature exists to prevent.
--
-- ⓘ The money mirrors positionsFor() + installmentSplit(). It is a plain share
-- because reminders only ever concern positions 2..N; the rounding remainder
-- lands on position 1, which is paid at checkout and never reminded about.
--
-- ⚠ Returns EVERY enrolment that still owes, whatever its status — callers
-- filter. Do not add a status filter here: the pause step and the reminders
-- want different ones.

DROP FUNCTION IF EXISTS nclex_enrolment_next_payment();

CREATE FUNCTION nclex_enrolment_next_payment()
RETURNS TABLE (
  enrolment_id   UUID,
  programme_id   UUID,
  status         TEXT,
  kind           TEXT,
  paid           INT,
  total          INT,
  position_no    INT,
  due_at         TIMESTAMPTZ,
  interval_days  INT,
  amount_minor   INT,
  currency       TEXT,
  gates_access   BOOLEAN,
  grace_until    TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT
    d.enrolment_id, d.programme_id, d.status, d.kind, d.paid, d.total,
    d.paid + 1 AS position_no,
    CASE d.kind
      WHEN 'DEPOSIT_BALANCE'
        THEN d.anchor + (COALESCE(d.balance_days, 0) || ' days')::interval
      ELSE d.anchor + (d.paid * COALESCE(d.interval_days, 0) || ' days')::interval
    END AS due_at,
    d.interval_days,
    CASE
      WHEN d.kind = 'DEPOSIT_BALANCE' AND d.paid = 0 THEN d.initial_minor
      WHEN d.kind = 'DEPOSIT_BALANCE'                THEN d.total_minor - d.initial_minor
      WHEN d.paid = 0 THEN d.total_minor - (d.total_minor / d.total) * (d.total - 1)
      ELSE d.total_minor / d.total
    END::int AS amount_minor,
    d.currency, d.gates_access, d.grace_until
  FROM (
    SELECT
      e.enrolment_id, e.programme_id,
      e.status::text            AS status,
      e.enrolled_at             AS anchor,
      e.installment_grace_until AS grace_until,
      p.price_currency          AS currency,
      p.payment_gates_access    AS gates_access,
      (e.strategy_snapshot_json->>'kind') AS kind,
      COALESCE(pp.paid, 0)::int AS paid,
      CASE (e.strategy_snapshot_json->>'kind')
        WHEN 'DEPOSIT_BALANCE'    THEN 2
        WHEN 'EQUAL_INSTALLMENTS' THEN (e.strategy_snapshot_json->>'installment_count')::int
      END AS total,
      (e.strategy_snapshot_json->>'total_price_minor')::int   AS total_minor,
      (e.strategy_snapshot_json->>'initial_price_minor')::int AS initial_minor,
      NULLIF(e.strategy_snapshot_json->>'installment_interval_days', '')::int        AS interval_days,
      NULLIF(e.strategy_snapshot_json->>'balance_due_days_after_enrolment', '')::int AS balance_days
    FROM nclex_enrolments e
    JOIN nclex_programmes p ON p.programme_id = e.programme_id
    LEFT JOIN (
      SELECT enrolment_id, COUNT(*) AS paid
      FROM nclex_payments
      WHERE purpose IN ('PROGRAMME_INITIAL', 'PROGRAMME_INSTALLMENT')
        AND status IN ('PAID', 'ACTIVATED') AND enrolment_id IS NOT NULL
      GROUP BY enrolment_id
    ) pp ON pp.enrolment_id = e.enrolment_id
    WHERE e.strategy_snapshot_json IS NOT NULL
      AND (e.strategy_snapshot_json->>'kind') IN ('DEPOSIT_BALANCE', 'EQUAL_INSTALLMENTS')
  ) d
  WHERE d.paid < d.total
$fn$;

REVOKE EXECUTE ON FUNCTION nclex_enrolment_next_payment() FROM PUBLIC, anon, authenticated;


-- =========================================================
-- 2. The sweep — same enforcement, now with a voice
-- =========================================================

CREATE OR REPLACE FUNCTION nclex_enrolment_nightly_sweep()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $sweep$
DECLARE
  r RECORD;
BEGIN
  IF COALESCE(
       (SELECT value FROM nclex_config WHERE key = 'enrolment_sweep_enabled'),
       'true'
     ) = 'false' THEN
    RETURN;
  END IF;

  -- ── 2a. REMINDERS — T-7 and T-3, before anything changes ──────────
  --
  -- ⭐ ROLLING WINDOWS, NEVER CALENDAR DATES. "Due within the next 24h"
  -- rather than "due today": the job looks once a day, so a payment due at
  -- 01:00 would be missed by every "today" test and the student paused having
  -- heard nothing. Each window is exactly one run wide, so they tile end to
  -- end — every due date falls inside exactly one.
  --
  -- ⓘ The fingerprint is the real backstop: stage carries BOTH the position
  -- and which reminder, so '2:T-7' and '2:T-3' are distinct rows while a
  -- second '2:T-7' is refused by the database however loose the window.
  --
  -- ⚠ The T-7 reminder is skipped on plans whose payments are less than a
  -- fortnight apart, or it would land before the previous payment was even
  -- due. A NULL interval means DEPOSIT_BALANCE, whose balance sits 30 days
  -- out, so it qualifies.
  FOR r IN
    SELECT
      np.enrolment_id, np.position_no, np.total, np.due_at, np.amount_minor,
      np.currency, np.gates_access,
      CASE WHEN np.due_at < now() + interval '4 days' THEN 'T-3' ELSE 'T-7' END AS lead,
      u.id AS to_user_id, lower(u.email) AS to_email, u.forename,
      p.title AS programme_title, c.name AS cohort_name, t.name AS tutor_name
    FROM nclex_enrolment_next_payment() np
    JOIN nclex_enrolments  e ON e.enrolment_id = np.enrolment_id
    JOIN nclex_users       u ON u.id = e.user_id
    JOIN nclex_programmes  p ON p.programme_id = np.programme_id
    JOIN nclex_users       t ON t.id = p.tutor_id
    LEFT JOIN nclex_cohorts c ON c.cohort_id = e.cohort_id
    WHERE np.status = 'ENROLLED'
      -- ⚠ Mirrors the @example.com guard in lib/email/outbox.ts. Those
      -- addresses never accept mail, so each is a guaranteed hard bounce, and
      -- dev seed data is full of them. This path does not go through
      -- enqueueEmail, so the guard has to be repeated here.
      AND lower(u.email) NOT LIKE '%@example.com'
      AND (
        (np.due_at >= now() + interval '3 days' AND np.due_at < now() + interval '4 days')
        OR
        (np.due_at >= now() + interval '7 days' AND np.due_at < now() + interval '8 days'
         AND (np.interval_days IS NULL OR np.interval_days >= 14))
      )
  LOOP
    INSERT INTO nclex_email_outbox
      (event_key, subject_ref, stage, to_email, to_user_id, payload_json)
    VALUES (
      'payment.installment_due',
      r.enrolment_id::text,
      r.position_no::text || ':' || r.lead,
      r.to_email,
      r.to_user_id,
      jsonb_build_object(
        'recipientName',  r.forename,
        'programmeTitle', r.programme_title,
        'cohortName',     r.cohort_name,
        'tutorName',      r.tutor_name,
        'currency',       r.currency,
        'amountMinor',    r.amount_minor,
        'dueAtISO',       r.due_at,
        'positionNo',     r.position_no,
        'totalPositions', r.total,
        'lead',           r.lead,
        'gatesAccess',    r.gates_access,
        'enrolmentId',    r.enrolment_id
      )
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ── 2b. THE OVERDUE NOTICE — computed BEFORE the pause ────────────
  --
  -- ⚠ THIS MUST RUN BEFORE STEP 2c, while the row is still ENROLLED.
  -- Afterwards it is PAUSED and this select finds nothing.
  --
  -- ⓘ Grace-covered students are excluded entirely. Their tutor has
  -- explicitly given them more time, so telling them they are overdue
  -- contradicts the thing the tutor just did. When grace lapses they fall
  -- into this select on a later night and are told then.
  --
  -- ⓘ Students on a programme with payment_gates_access = FALSE ARE included:
  -- they genuinely owe money. `paused` in the payload is what lets one
  -- template say "your access is paused" to some and "your access is
  -- unaffected" to others, and never make a claim untrue for its reader.
  FOR r IN
    SELECT
      np.enrolment_id, np.position_no, np.total, np.due_at, np.amount_minor,
      np.currency, np.gates_access,
      u.id AS to_user_id, lower(u.email) AS to_email, u.forename,
      p.title AS programme_title, c.name AS cohort_name, t.name AS tutor_name
    FROM nclex_enrolment_next_payment() np
    JOIN nclex_enrolments  e ON e.enrolment_id = np.enrolment_id
    JOIN nclex_users       u ON u.id = e.user_id
    JOIN nclex_programmes  p ON p.programme_id = np.programme_id
    JOIN nclex_users       t ON t.id = p.tutor_id
    LEFT JOIN nclex_cohorts c ON c.cohort_id = e.cohort_id
    WHERE np.status = 'ENROLLED'
      AND np.due_at < now()
      AND (np.grace_until IS NULL OR np.grace_until < now())
      AND lower(u.email) NOT LIKE '%@example.com'
  LOOP
    INSERT INTO nclex_email_outbox
      (event_key, subject_ref, stage, to_email, to_user_id, payload_json)
    VALUES (
      'payment.installment_overdue',
      r.enrolment_id::text,
      r.position_no::text || ':overdue',
      r.to_email,
      r.to_user_id,
      jsonb_build_object(
        'recipientName',  r.forename,
        'programmeTitle', r.programme_title,
        'cohortName',     r.cohort_name,
        'tutorName',      r.tutor_name,
        'currency',       r.currency,
        'amountMinor',    r.amount_minor,
        'dueAtISO',       r.due_at,
        'positionNo',     r.position_no,
        'totalPositions', r.total,
        'paused',         r.gates_access,
        'enrolmentId',    r.enrolment_id
      )
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ── 2c. ENROLLED -> PAUSED ────────────────────────────────────────
  -- Identical rule to 20260706120000: overdue, no active grace, and only on
  -- programmes the tutor left payment-gated. The arithmetic now comes from the
  -- shared function instead of being spelled out again.
  UPDATE nclex_enrolments e
  SET status = 'PAUSED', paused_at = NOW(), paused_reason = 'INSTALLMENT_OVERDUE',
      updated_at = NOW()
  WHERE e.status = 'ENROLLED'
    AND e.enrolment_id IN (
      SELECT np.enrolment_id
      FROM nclex_enrolment_next_payment() np
      WHERE np.status = 'ENROLLED'
        AND np.due_at < now()
        AND np.gates_access = TRUE
        AND (np.grace_until IS NULL OR np.grace_until < now())
    );

  -- ── 2d. ENROLLED / PAUSED -> EXPIRED past the access window ───────
  -- Unchanged. ⓘ No email: enrolment.access_expiring / access_expired are
  -- catalogued but blocked on the access-window discussion.
  UPDATE nclex_enrolments
  SET status = 'EXPIRED', terminal_at = NOW(), updated_at = NOW()
  WHERE status IN ('ENROLLED', 'PAUSED')
    AND access_expires_at IS NOT NULL
    AND access_expires_at < NOW();

  -- ── 2e. Subscriptions -> EXPIRED past end_at ──────────────────────
  -- Unchanged. ⓘ No catalog entry exists for a bank or readiness pass
  -- expiring; it probably wants the same pair, but it is not promised.
  UPDATE nclex_subscriptions
  SET status = 'EXPIRED', updated_at = NOW()
  WHERE status = 'ACTIVE'
    AND end_at IS NOT NULL
    AND end_at < NOW();
END;
$sweep$;

REVOKE EXECUTE ON FUNCTION nclex_enrolment_nightly_sweep() FROM PUBLIC, anon, authenticated;
