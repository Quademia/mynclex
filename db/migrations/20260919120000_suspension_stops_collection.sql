-- mynclex/db/migrations/20260919120000_suspension_stops_collection.sql
--
-- Tutor onboarding — slice 1d-v: "money in flight stops".
-- Plan: docs/product-plan/tutor-onboarding.md §7 (switch 2).
--
-- ⭐ WHY THIS IS PART OF 1d AND NOT A NICE-TO-HAVE. The suspend dialog
-- shows an admin four switches and says which fire. Three of them were
-- true after 1d-iii; "Instalment collection on their programmes —
-- Stopped" was not. A panel like that is read as a guarantee, so an
-- untrue row in it is worse than no row at all.
--
-- ⚠⚠ AND THE PAUSE IS THE HALF THAT ACTUALLY MATTERS. Stopping the two
-- reminder emails is the obvious reading of "collection stops". But step
-- 2c PAUSES a student's access for arrears — and if we stop asking for
-- the money while continuing to punish people for not paying it, we lock
-- a student out over an instalment we deliberately stopped reminding
-- them about. That is precisely the outcome §7 exists to prevent:
-- "cutting off materials punishes the student for the tutor's conduct".
-- Reminders without the pause would have looked finished and been
-- exactly backwards.
--
-- ⓘ THREE BLOCKS CHANGE, TWO DELIBERATELY DO NOT.
--   2a  due reminders      → skipped for a suspended tutor
--   2b  overdue reminders  → skipped
--   2c  ENROLLED → PAUSED  → skipped   ⭐ the one above
--   2d  access-window expiry — UNCHANGED. That window is what the
--       student bought; time passes for a suspended tutor's students
--       like anyone else's, and freezing it would hand them a longer
--       access period than they paid for.
--   2e  subscription expiry — UNCHANGED. Bank and readiness passes are
--       sold by us, not by the tutor, and have nothing to do with them.
--
-- ⓘ Fail closed, like the views and the checkout gate: an inner join, so
-- a programme whose tutor has no record collects nothing. §4.4 keeps
-- that from occurring, and if it ever does the safe failure is to stop
-- taking money rather than to keep taking it.
--
-- ⚠ The tutor-record alias is `tt`. `t` is already nclex_users in blocks
-- 2a and 2b (it supplies tutor_name for the email payloads).

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

  -- ── 2d. ENROLLED / PAUSED -> EXPIRED past the access window ───────
  -- ⓘ UNCHANGED BY 1d on purpose — see the header. The access window is
  -- what the student bought; a suspension does not extend it.
  UPDATE nclex_enrolments
  SET status = 'EXPIRED', terminal_at = NOW(), updated_at = NOW()
  WHERE status IN ('ENROLLED', 'PAUSED')
    AND access_expires_at IS NOT NULL
    AND access_expires_at < NOW();

  -- ── 2e. Subscriptions -> EXPIRED past end_at ──────────────────────
  -- ⓘ UNCHANGED BY 1d — sold by us, not by the tutor.
  UPDATE nclex_subscriptions
  SET status = 'EXPIRED', updated_at = NOW()
  WHERE status = 'ACTIVE'
    AND end_at IS NOT NULL
    AND end_at < NOW();
END;
$sweep$;

REVOKE EXECUTE ON FUNCTION nclex_enrolment_nightly_sweep() FROM PUBLIC, anon, authenticated;
