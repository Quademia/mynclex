-- mynclex/db/migrations/20260920120000_suspension_stops_session_reminders.sql
--
-- Tutor onboarding — 1d follow-up: stop telling a suspended tutor's
-- students that their live class is going ahead.
-- Plan: docs/product-plan/tutor-onboarding.md §7.
--
-- ⚠⚠ THIS IS A DEFECT FIX, NOT A FEATURE. §7's own rationale says
-- "pretending future sessions will still happen is a lie the product
-- would be telling" — and until this migration we were telling it
-- ourselves, automatically, at 07:00 every morning. The nightly pass
-- picks every scheduled class in the next 7 days and emails the cohort
-- "your class is on Tuesday, here is the join link"; it looks the tutor
-- up only for their NAME and never asked whether they were still active.
--
-- ⓘ WHY IT WAS MISSED IN 1d-v. §7 enumerates four switches and this is a
-- FIFTH consequence of the same decision — the live sessions are neither
-- "new students joining", "money in flight", "the workspace", nor
-- "existing students' materials". It came out of Sam asking what the
-- STUDENT sees during a suspension, which is the half 1d did not build.
-- ⭐ A four-row table of consequences is a summary, not an inventory.
--
-- ⚠ IT DOES NOT UNSEND ANYTHING. Reminders go out up to seven days
-- ahead and the fingerprint means each class is announced exactly once,
-- so a student may already hold a "see you Tuesday" for a class that is
-- now not happening. Nothing here can recall it. Only a notice on the
-- student's own screen closes that window — see §7, "OPEN — the student
-- is never told". This migration stops the leak; it does not mop up.

-- ── 1. the builder ───────────────────────────────────────────────────
-- ⓘ The standing is selected as a COLUMN and branched on separately,
-- rather than added to the WHERE. Folding it into the lookup would make
-- a suspended tutor indistinguishable from a deleted session, and the
-- early return below is documented as "not an error" for a reason that
-- does not apply here.
--
-- ⓘ LEFT JOIN + IS DISTINCT FROM: fail closed, matching the public views
-- and the checkout gate. No tutor record means no record that we
-- approved them, which must not read as "carry on emailing".

CREATE OR REPLACE FUNCTION nclex_enqueue_session_reminders(
  p_session_id UUID,
  p_manual     BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  s RECORD;
  n INTEGER := 0;
BEGIN
  SELECT
    ls.session_id, ls.cohort_id, ls.scheduled_at, ls.duration_minutes,
    ls.platform, ls.join_url, ls.meeting_id, ls.passcode,
    ls.joining_instructions, ls.updated_at,
    a.title  AS session_title,
    c.name   AS cohort_name,
    p.title  AS programme_title,
    t.name   AS tutor_name,
    tt.status AS tutor_status          -- 1d
  INTO s
  FROM nclex_cohort_live_sessions ls
  JOIN nclex_programme_activities a ON a.activity_id = ls.marker_activity_id
  JOIN nclex_cohorts              c ON c.cohort_id   = ls.cohort_id
  JOIN nclex_programmes           p ON p.programme_id = c.programme_id
  JOIN nclex_users                t ON t.id          = p.tutor_id
  LEFT JOIN nclex_tutors          tt ON tt.user_id   = p.tutor_id   -- 1d
  WHERE ls.session_id = p_session_id;

  -- An unscheduled class has no time to put in the email and no epoch to
  -- fingerprint with. Not an error — the planner deliberately allows a
  -- session to exist before its date does.
  IF NOT FOUND OR s.scheduled_at IS NULL THEN
    RETURN 0;
  END IF;

  -- ⭐ 1d. The class is not going ahead, so nobody is told it is. Silent
  -- and countable: the nightly pass treats 0 as its normal steady state,
  -- and the tutor's button cannot reach here (see the guard added to
  -- nclex_tutor_send_session_reminder below).
  IF s.tutor_status IS DISTINCT FROM 'APPROVED' THEN
    RETURN 0;
  END IF;

  WITH ins AS (
    INSERT INTO nclex_email_outbox
      (event_key, subject_ref, stage, to_email, to_user_id, payload_json)
    SELECT
      'session.reminder',
      p_session_id::TEXT || '@' || EXTRACT(EPOCH FROM s.scheduled_at)::BIGINT::TEXT,
      u.id::TEXT || CASE WHEN p_manual THEN ':manual' ELSE '' END,
      lower(u.email),
      u.id,
      jsonb_build_object(
        'recipientName',        u.forename,
        'programmeTitle',       s.programme_title,
        'cohortName',           s.cohort_name,
        'tutorName',            s.tutor_name,
        'sessionTitle',         s.session_title,
        'scheduledAtISO',       s.scheduled_at,
        'durationMinutes',      s.duration_minutes,
        'platform',             s.platform,
        'joinUrl',              s.join_url,
        'meetingId',            s.meeting_id,
        'passcode',             s.passcode,
        'joiningInstructions',  s.joining_instructions,
        'sessionId',            s.session_id,
        'sequence',             EXTRACT(EPOCH FROM s.updated_at)::BIGINT,
        'trigger',              CASE WHEN p_manual THEN 'MANUAL' ELSE 'NIGHTLY' END
      )
    FROM nclex_enrolments e
    JOIN nclex_users u ON u.id = e.user_id
    WHERE e.cohort_id = s.cohort_id
      AND e.status = 'ENROLLED'
      AND lower(u.email) NOT LIKE '%@example.com'
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO n FROM ins;

  RETURN n;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION nclex_enqueue_session_reminders(UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

-- ── 2. the tutor's own "send now" button ─────────────────────────────
-- ⚠ ITS EXISTING GATE IS OWNERSHIP, NOT STANDING — `v_tutor = auth.uid()`
-- asks "is this your session?", which a suspended tutor still passes:
-- suspension revokes the TUTOR ROLE, it does not reassign their
-- programmes. The button is unreachable for them (the tutor pages need
-- the role they just lost) but this function is EXECUTE-granted to
-- `authenticated` and would have accepted a direct call. UI-only gating
-- is exactly what the layered-access rule exists to prevent, and the
-- comment block already in this function argues the same point about the
-- global switch.
--
-- ⓘ It RAISES rather than returning zero, unlike the builder. A person
-- pressed this; silence would read as "sent to nobody".

CREATE OR REPLACE FUNCTION nclex_tutor_send_session_reminder(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_tutor    UUID;
  v_when     TIMESTAMPTZ;
  v_cohort   UUID;
  v_eligible INTEGER;
  v_queued   INTEGER;
BEGIN
  SELECT p.tutor_id, ls.scheduled_at, ls.cohort_id
  INTO v_tutor, v_when, v_cohort
  FROM nclex_cohort_live_sessions ls
  JOIN nclex_cohorts    c ON c.cohort_id    = ls.cohort_id
  JOIN nclex_programmes p ON p.programme_id = c.programme_id
  WHERE ls.session_id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found.';
  END IF;

  -- ⚠ The gate is here, in SQL, not only in the server action. UX is in TS,
  -- security is in SQL — a SECURITY DEFINER function that skipped this would
  -- let any signed-in user email somebody else's cohort.
  IF v_tutor IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'This session belongs to another tutor.';
  END IF;

  -- ⭐ 1d. Ownership is not standing — see the note above this function.
  IF NOT EXISTS (
    SELECT 1 FROM nclex_tutors tt
     WHERE tt.user_id = v_tutor AND tt.status = 'APPROVED'
  ) THEN
    RAISE EXCEPTION 'Your tutor account is not active, so class reminders cannot be sent.';
  END IF;

  IF v_when IS NULL THEN
    RAISE EXCEPTION 'This session has no date yet.';
  END IF;

  IF v_when < now() THEN
    RAISE EXCEPTION 'This class has already taken place.';
  END IF;

  IF COALESCE(
       (SELECT value FROM nclex_config WHERE key = 'session_reminders_enabled'),
       'true'
     ) = 'false' THEN
    RAISE EXCEPTION 'Live-class reminders are switched off for the whole site. An administrator can turn them back on in Admin settings.';
  END IF;

  SELECT count(*)
  INTO v_eligible
  FROM nclex_enrolments e
  JOIN nclex_users u ON u.id = e.user_id
  WHERE e.cohort_id = v_cohort
    AND e.status = 'ENROLLED'
    AND lower(u.email) NOT LIKE '%@example.com';

  v_queued := nclex_enqueue_session_reminders(p_session_id, TRUE);

  RETURN jsonb_build_object('queued', v_queued, 'eligible', v_eligible);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION nclex_tutor_send_session_reminder(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION nclex_tutor_send_session_reminder(UUID) TO authenticated;
