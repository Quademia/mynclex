-- =========================================================
-- MyNclex — The access window starts speaking, and a tutor can move it
-- File: mynclex/db/migrations/20260923120000_access_expiry_emails.sql
-- =========================================================
-- Step 2d of the nightly sweep has been ending students' access in
-- silence since 2026-06-08. It now speaks three times:
--
--   T-14     enrolment.access_expiring   stage '<date>:T-14'   a heads-up
--   T-3      enrolment.access_expiring   stage '<date>:T-3'    the last call
--   at it    enrolment.access_expired    stage '<date>:expired' it happened
--
-- ⭐ THE RULE THIS COMPLETES (settled 2026-08-12): a scheduled email is a
-- state change, warned or recorded. Migration 20260911120000 built the pair
-- for step 2c (pause for arrears). This is the pair for step 2d, and it is
-- the last one the sweep owes — 2e (subscriptions) has no catalog entry.
--
-- ⭐⭐ WHY THIS MATTERS MORE THAN THE ARREARS PAIR, THOUGH IT LOOKS SMALLER
-- (Sam, 2026-08-24). A tutor may teach for four weeks and grant six months
-- of access — the two are deliberately independent. So by the time the
-- window closes, the live sessions finished months ago and the tutor has
-- moved on to the next cohort. The arrears pair has a human in the loop: an
-- active tutor with a live roster who can notice. This one has nobody. If
-- the email does not tell her, NOTHING does — she finds the door locked one
-- morning, long after anyone was paying attention.
--
-- ⚠ CORRECTION TO THE RECORD. transactional-email.md called these two
-- "blocked on access windows" until 2026-08-24. They were never blocked:
-- access_window_days shipped 2026-05-27 and step 2d has read it since
-- 2026-06-08. ⓘ Checked before building rather than repeated: step 2d has
-- in fact never fired — zero EXPIRED enrolments on dev, zero enrolments on
-- prod. Nobody has been harmed by the silence yet. The earliest live window
-- on dev closes 2026-09-04, so this lands with eleven days to spare.
--
-- Three things, and NO change to who gets expired or when:
--   1. access_extension_history_json  — a tutor can move the window
--   2. programme_access_expiry_emails_enabled — one switch, both emails
--   3. the sweep learns to warn (2d-i) and to record (2d-ii)
--
-- Source of truth: docs/product-plan/transactional-email.md,
--                  docs/product-plan/payments-and-enrolment.md

BEGIN;

-- =========================================================
-- 1. A tutor can give more time — recorded, not just applied
-- =========================================================
-- ⭐ THE SHAPE IS ALREADY IN THIS TABLE. grace_history_json (migration
-- 20260610120000) is a tutor-granted extension of a payment deadline with an
-- append-only record of who granted what and when. Extending access is the
-- same act pointed at a different column, so it gets the same shape rather
-- than a new events table — Sam's standing pattern: history as a JSONB array
-- beside the authoritative scalar.
--
-- ⚠ THE SCALAR IS STILL THE TRUTH. access_expires_at is what step 2d reads
-- and what the warning quotes; this column is the audit trail beside it.
-- ONE statement must write both or they drift — see lib/enrolments/actions.ts.
--
-- Each entry: { granted_at, granted_by, days, from, to, was_expired }.
-- `from` is deliberately recorded even though it is derivable from the
-- previous entry: the first extension has no previous entry, and a tutor
-- reading "was 4 Sept, now 4 Dec" should not have to reconstruct it.
ALTER TABLE nclex_enrolments
  ADD COLUMN IF NOT EXISTS access_extension_history_json JSONB NOT NULL
    DEFAULT '[]'::jsonb;

COMMENT ON COLUMN nclex_enrolments.access_extension_history_json IS
  'Append-only log of tutor-granted access extensions. The authoritative '
  'value is access_expires_at; this records how it got there.';


-- =========================================================
-- 2. One switch, covering both scheduled emails
-- =========================================================
-- ⚠⚠ IT GOVERNS THE EMAILS, NEVER THE EXPIRY. With this off, step 2d still
-- expires people exactly as before — we simply stop telling them, which is
-- the status quo this migration exists to end. A switch that silently
-- stopped enforcing time on enrolments would be a far bigger lever than the
-- admin pressing it thinks they are pulling.
--
-- ⚠ SEEDED HERE **AND** DECLARED IN app/(app)/admin/config/config-defs.ts.
-- A key in one and not the other is invisible on the admin screen — exactly
-- how email_drain_enabled was missed on its first pass.
--
-- ⓘ ONE SWITCH, NOT A PANEL OF DIALS (Sam). The T-14 / T-3 leads stay
-- constants in the sweep below.
--
-- ⓘ enrolment.access_extended is deliberately NOT covered. A switch exists
-- to stop what the system does on its own; that email is the direct
-- consequence of a tutor pressing a button two seconds earlier, like
-- enrolment.approved, which has no switch either. Silencing it would leave
-- the tutor with no way of knowing their student was never told.
INSERT INTO nclex_config (key, value, description) VALUES
  ('programme_access_expiry_emails_enabled', 'true',
   'Warns students before their programme access window closes (T-14, T-3) '
   'and tells them when it has. Does NOT control the expiry itself.')
ON CONFLICT (key) DO NOTHING;


-- =========================================================
-- 3. The sweep learns to speak about access
-- =========================================================
-- Redefines nclex_enrolment_nightly_sweep(). ⚠ THE LIVE DEFINITION IS NOT
-- THE ONE YOU FIND FIRST — this is the fifth: 20260608 (original), 20260610
-- (grace), 20260706 (payment gating), 20260911 (the arrears pair), and now
-- this. Blocks 2a, 2b, 2c and 2e are carried forward BYTE-FOR-BYTE; only
-- 2d grows a warning before it and a notice out of it.
--
-- ⭐⭐ THE FINGERPRINT CARRIES THE EXPIRY DATE, AND THAT IS NOT COSMETIC.
-- (event_key, subject_ref, stage) is unique, so a stage of plain 'T-14'
-- would fire once per enrolment FOREVER. Because a tutor can now extend the
-- window, one enrolment can legitimately approach expiry many times — and
-- the second warning would hit the index and SILENTLY NEVER SEND. Nothing
-- errors; the email simply does not arrive. That is the precise trap the
-- inactivity nudge nearly shipped with (2026-08-24), and the rule it taught:
-- when the same subject can reach the same state twice, the stage must name
-- WHICH OCCURRENCE. Dating the stage solves both halves at once — a new
-- expiry date is a new email, so an extension re-arms the warning instead
-- of being suppressed by the one we already sent.
--
-- ⚠ DATE, NOT TIMESTAMP, in the stage. access_expires_at carries
-- microseconds; a tutor extending twice in one day would otherwise mint two
-- fingerprints for what a student experiences as one change.
CREATE OR REPLACE FUNCTION nclex_enrolment_nightly_sweep()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $sweep$
DECLARE
  r RECORD;
  access_emails_on BOOLEAN;
BEGIN
  IF COALESCE(
       (SELECT value FROM nclex_config WHERE key = 'enrolment_sweep_enabled'),
       'true'
     ) = 'false' THEN
    RETURN;
  END IF;

  access_emails_on := COALESCE(
    (SELECT value FROM nclex_config
      WHERE key = 'programme_access_expiry_emails_enabled'),
    'true'
  ) = 'true';

  -- ── 2a. REMINDERS — T-7 and T-3, before anything changes ──────────
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
    JOIN nclex_tutors      tt ON tt.user_id = p.tutor_id AND tt.status = 'APPROVED'  -- 1d
    LEFT JOIN nclex_cohorts c ON c.cohort_id = e.cohort_id
    WHERE np.status = 'ENROLLED'
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
  -- ⚠ THIS MUST RUN BEFORE STEP 2c, while the row is still ENROLLED.
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
    JOIN nclex_tutors      tt ON tt.user_id = p.tutor_id AND tt.status = 'APPROVED'  -- 1d
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
  -- ⭐ SUSPENDED TUTORS' STUDENTS ARE NOT PAUSED (1d). We stopped asking
  -- them for the money above; pausing them for not paying it would lock
  -- a student out over an instalment we chose not to remind them about.
  UPDATE nclex_enrolments e
  SET status = 'PAUSED', paused_at = NOW(), paused_reason = 'INSTALLMENT_OVERDUE',
      updated_at = NOW()
  WHERE e.status = 'ENROLLED'
    AND e.enrolment_id IN (
      SELECT np.enrolment_id
      FROM nclex_enrolment_next_payment() np
      JOIN nclex_programmes p ON p.programme_id = np.programme_id
      JOIN nclex_tutors    tt ON tt.user_id = p.tutor_id AND tt.status = 'APPROVED'  -- 1d
      WHERE np.status = 'ENROLLED'
        AND np.due_at < now()
        AND np.gates_access = TRUE
        AND (np.grace_until IS NULL OR np.grace_until < now())
    );

  -- ── 2d-i. THE ACCESS WARNING — T-14 and T-3, before the door shuts ─
  --
  -- ⭐ FOURTEEN DAYS, NOT SEVEN (Sam, 2026-08-24). The arrears pair warns at
  -- T-7 because the student already committed to that payment and knows the
  -- amount. Losing access is a decision, not a reminder: she has to weigh
  -- whether she still needs the programme and find money for it. A week is
  -- short notice for that; T-3 remains as the last call.
  --
  -- ⭐ SENT EVEN WHEN THE TUTOR IS SUSPENDED (Sam) — and this deliberately
  -- INVERTS blocks 2a/2b directly above. Those fail closed on purpose: if we
  -- cannot confirm a tutor is in good standing, the safe failure is to stop
  -- taking their students' money. Here the safe failure is the opposite. Step
  -- 2d expires this student whatever their tutor's standing (it is the window
  -- she bought), so staying silent would not protect her from anything — it
  -- would only mean she loses access with no warning at all. Hence a LEFT
  -- JOIN on nclex_tutors and `tutorActive` in the payload: the template says
  -- "speak to Steven" only when Steven can actually answer, and points at us
  -- otherwise. ⚠ Do not "fix" this into an inner join to match its
  -- neighbours; the asymmetry is the point.
  --
  -- ⓘ PAUSED students are included. Their access is about to end
  -- PERMANENTLY, which is a different and worse thing than the temporary
  -- hold they are already living with — `wasPaused` lets the template avoid
  -- announcing a loss they think they already suffered.
  --
  -- ⓘ Lifetime enrolments fall out on `access_expires_at IS NOT NULL`.
  IF access_emails_on THEN
    FOR r IN
      SELECT
        e.enrolment_id, e.programme_id, e.access_expires_at, e.status,
        CASE WHEN e.access_expires_at < now() + interval '4 days'
             THEN 'T-3' ELSE 'T-14' END AS lead,
        u.id AS to_user_id, lower(u.email) AS to_email, u.forename,
        p.title AS programme_title, c.name AS cohort_name,
        t.name AS tutor_name,
        COALESCE(tt.status = 'APPROVED', FALSE) AS tutor_active
      FROM nclex_enrolments  e
      JOIN nclex_users       u  ON u.id = e.user_id
      JOIN nclex_programmes  p  ON p.programme_id = e.programme_id
      JOIN nclex_users       t  ON t.id = p.tutor_id
      LEFT JOIN nclex_tutors tt ON tt.user_id = p.tutor_id
      LEFT JOIN nclex_cohorts c ON c.cohort_id = e.cohort_id
      WHERE e.status IN ('ENROLLED', 'PAUSED')
        AND e.access_expires_at IS NOT NULL
        -- ⚠ Mirrors the @example.com guard in lib/email/outbox.ts. Those
        -- addresses never accept mail, so each is a guaranteed hard bounce,
        -- and dev seed data is full of them. This path does not go through
        -- enqueueEmail, so the guard has to be repeated here.
        AND lower(u.email) NOT LIKE '%@example.com'
        AND (
          (e.access_expires_at >= now() + interval '3 days'
           AND e.access_expires_at < now() + interval '4 days')
          OR
          (e.access_expires_at >= now() + interval '14 days'
           AND e.access_expires_at < now() + interval '15 days')
        )
    LOOP
      INSERT INTO nclex_email_outbox
        (event_key, subject_ref, stage, to_email, to_user_id, payload_json)
      VALUES (
        'enrolment.access_expiring',
        r.enrolment_id::text,
        to_char(r.access_expires_at, 'YYYY-MM-DD') || ':' || r.lead,
        r.to_email,
        r.to_user_id,
        jsonb_build_object(
          'recipientName',  r.forename,
          'programmeTitle', r.programme_title,
          'cohortName',     r.cohort_name,
          'tutorName',      r.tutor_name,
          'tutorActive',    r.tutor_active,
          'expiresAtISO',   r.access_expires_at,
          'lead',           r.lead,
          'wasPaused',      r.status = 'PAUSED',
          'programmeId',    r.programme_id,
          'enrolmentId',    r.enrolment_id
        )
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- ── 2d-ii. ENROLLED / PAUSED -> EXPIRED, and the notice out of it ──
  --
  -- ⭐⭐ THE EMAIL COMES OUT OF THE UPDATE, NOT A SELECT BESIDE IT. Block 2b
  -- had to solve the same problem with an ordering rule and a shouted
  -- comment ("⚠ THIS MUST RUN BEFORE STEP 2c") — because once the status has
  -- changed, the select that would find those students finds nothing. A
  -- data-modifying CTE removes the rule instead of restating it: the set of
  -- emails IS the set of rows that flipped, by construction, and no future
  -- edit can reorder them apart.
  --
  -- ⚠ RETURNING SEES NEW VALUES, so it cannot tell us they were PAUSED
  -- before — the row now says EXPIRED. `doomed` captures the old status
  -- first and UPDATE ... FROM carries it through, which is also why this is
  -- not the more obvious plain `UPDATE ... RETURNING`.
  --
  -- ⓘ UNCHANGED BY 1d on purpose. The access window is what the student
  -- bought; a suspension does not extend it.
  --
  -- ⚠ THE EXPIRY RUNS WHETHER OR NOT THE EMAILS DO. When the switch is off
  -- this is an ordinary UPDATE and the loop body simply never queues — the
  -- rows still flip. The switch was never a licence to stop enforcing time.
  FOR r IN
    WITH doomed AS (
      SELECT enrolment_id, status AS old_status
      FROM nclex_enrolments
      WHERE status IN ('ENROLLED', 'PAUSED')
        AND access_expires_at IS NOT NULL
        AND access_expires_at < NOW()
    ),
    expired AS (
      UPDATE nclex_enrolments e
      SET status = 'EXPIRED', terminal_at = NOW(), updated_at = NOW()
      FROM doomed d
      WHERE e.enrolment_id = d.enrolment_id
      RETURNING e.enrolment_id, e.user_id, e.programme_id, e.cohort_id,
                e.access_expires_at, d.old_status
    )
    SELECT
      x.enrolment_id, x.programme_id, x.access_expires_at, x.old_status,
      u.id AS to_user_id, lower(u.email) AS to_email, u.forename,
      p.title AS programme_title, c.name AS cohort_name,
      t.name AS tutor_name,
      COALESCE(tt.status = 'APPROVED', FALSE) AS tutor_active
    FROM expired x
    JOIN nclex_users       u  ON u.id = x.user_id
    JOIN nclex_programmes  p  ON p.programme_id = x.programme_id
    JOIN nclex_users       t  ON t.id = p.tutor_id
    LEFT JOIN nclex_tutors tt ON tt.user_id = p.tutor_id
    LEFT JOIN nclex_cohorts c ON c.cohort_id = x.cohort_id
    WHERE lower(u.email) NOT LIKE '%@example.com'
  LOOP
    CONTINUE WHEN NOT access_emails_on;

    INSERT INTO nclex_email_outbox
      (event_key, subject_ref, stage, to_email, to_user_id, payload_json)
    VALUES (
      'enrolment.access_expired',
      r.enrolment_id::text,
      to_char(r.access_expires_at, 'YYYY-MM-DD') || ':expired',
      r.to_email,
      r.to_user_id,
      jsonb_build_object(
        'recipientName',  r.forename,
        'programmeTitle', r.programme_title,
        'cohortName',     r.cohort_name,
        'tutorName',      r.tutor_name,
        'tutorActive',    r.tutor_active,
        'expiresAtISO',   r.access_expires_at,
        'wasPaused',      r.old_status = 'PAUSED',
        'programmeId',    r.programme_id,
        'enrolmentId',    r.enrolment_id
      )
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ── 2e. Subscriptions -> EXPIRED past end_at ──────────────────────
  -- ⓘ UNCHANGED BY 1d — sold by us, not by the tutor.
  -- ⓘ Still no email: a bank or readiness pass expiring notifies nobody.
  -- It probably wants this same pair — ⚠ and unlike step 2d, this one HAS
  -- already fired in silence (one subscription on dev, 2026-08-09). It is
  -- not in the catalog, so it is not promised, and it stays out of scope
  -- here deliberately rather than by oversight.
  UPDATE nclex_subscriptions
  SET status = 'EXPIRED', updated_at = NOW()
  WHERE status = 'ACTIVE'
    AND end_at IS NOT NULL
    AND end_at < NOW();
END;
$sweep$;

REVOKE EXECUTE ON FUNCTION nclex_enrolment_nightly_sweep() FROM PUBLIC, anon, authenticated;

COMMIT;
