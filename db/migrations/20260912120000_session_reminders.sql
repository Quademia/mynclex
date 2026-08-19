-- =========================================================
-- MyNclex — The live-class reminder: one builder, two triggers
-- File: mynclex/db/migrations/20260912120000_session_reminders.sql
-- =========================================================
-- The first FAN-OUT email in the product: one trigger, a whole cohort of
-- recipients. Everything sent so far has had exactly one.
--
-- ⭐⭐ THE RULE (settled with Sam 2026-08-19, after the design moved four
-- times): ONE NIGHTLY PASS asks one question — which classes fall in the
-- next 7 days, and who in those cohorts has not been told yet? Each match
-- gets one email carrying a calendar attachment.
--
-- ⚠ WHY NOT "send it when the tutor schedules it", which is the obvious
-- design and was nearly built: tutors set the whole timetable WHEN THEY
-- CREATE THE COHORT, before anyone has enrolled. An email anchored to that
-- moment fans out to an empty cohort. Sam's question killed it — "a student
-- that joined 2 weeks after the tutor finished setting up the session times,
-- will they receive the emails?" No. And that is the normal case, not an
-- edge one.
--
-- ⭐ The repair is not "add more triggers". Firing on whichever-happens-second
-- needs FIVE trigger points (the four doors into a cohort, plus scheduling),
-- and five places to keep in step is exactly how the approval email went
-- missing for a week. The nightly pass never asks HOW she got into the
-- cohort, so there is no door to forget. The cron version is SIMPLER than the
-- event version — the opposite of the usual trade.
--
-- Source of truth: docs/product-plan/transactional-email.md → Live sessions


-- =========================================================
-- 1. The fingerprint, which carries all four design decisions
-- =========================================================
--   event_key    session.reminder
--   subject_ref  <session_id>@<epoch of scheduled_at>   the class AT THIS TIME
--   stage        <student_id>            nightly
--                <student_id>:manual     the tutor's deliberate send
--
-- ⭐ ONE ROW PER STUDENT, not per cohort. A cohort-wide row is tidier right
-- up to the moment one address is bad: the send fails for everybody, the
-- retry re-sends to everybody, and the outbox cannot tell you who actually
-- missed it. Per-student, a bad address fails alone and /admin/emails answers
-- "who was told" directly.
--
-- ⭐⭐ THE TIME IS IN subject_ref, AND THAT IS HOW RESCHEDULING WORKS. Move a
-- class and every student's fingerprint changes, so the next nightly pass
-- re-sends by itself — no trigger to wire, nothing to remember. Had the
-- fingerprint been the bare session id, the correction would have been
-- refused as a duplicate and the cohort left holding the old time.
--
-- ⭐ AND IT IS WHY THE TUTOR'S BUTTON REFILLS ON A RESCHEDULE. Sam's rule is
-- one manual send per class — an open button is a tutor emailing 25 nurses
-- four times about one lesson. But "once per session id" would gag the one
-- person who most needs to speak after a class moves. Tying the allowance to
-- the OCCURRENCE gives both: spent once per class, refilled when the class
-- genuinely becomes a different one.
--
-- Ceiling: two emails per student per occurrence — the nightly one, and one
-- deliberate.


-- =========================================================
-- 2. The one builder both triggers call
-- =========================================================
-- ⚠ THE SINGLE MOST IMPORTANT LINE IN THIS FILE IS THAT THERE IS ONLY ONE OF
-- IT. If the button were wired straight to its own send, the automatic path
-- would be written twice and the two would drift — one gaining a field, the
-- other keeping old wording, and nobody noticing because both "work".
-- Manual-vs-automatic is a TRIGGER decision; it must not become an
-- architecture decision. Same rule the payment anchors follow: three callers,
-- one builder.
--
-- ⓘ Returns the number of rows actually inserted — NOT the size of the
-- cohort. `ON CONFLICT DO NOTHING` silently drops anyone already told, which
-- is the whole mechanism, so the count is "how many people this send newly
-- reached". The tutor's button shows that number, and a nightly run of 0 is
-- the normal steady state rather than a fault.

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
    t.name   AS tutor_name
  INTO s
  FROM nclex_cohort_live_sessions ls
  JOIN nclex_programme_activities a ON a.activity_id = ls.marker_activity_id
  JOIN nclex_cohorts              c ON c.cohort_id   = ls.cohort_id
  JOIN nclex_programmes           p ON p.programme_id = c.programme_id
  JOIN nclex_users                t ON t.id          = p.tutor_id
  WHERE ls.session_id = p_session_id;

  -- An unscheduled class has no time to put in the email and no epoch to
  -- fingerprint with. Not an error — the planner deliberately allows a
  -- session to exist before its date does.
  IF NOT FOUND OR s.scheduled_at IS NULL THEN
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
        -- ⭐ The .ics SEQUENCE. Monotonic by definition and maintained by
        -- nobody: a calendar is entitled to ignore an update whose SEQUENCE
        -- did not increase, which would leave her phone showing the old time
        -- after a reschedule.
        'sequence',             EXTRACT(EPOCH FROM s.updated_at)::BIGINT,
        'trigger',              CASE WHEN p_manual THEN 'MANUAL' ELSE 'NIGHTLY' END
      )
    FROM nclex_enrolments e
    JOIN nclex_users u ON u.id = e.user_id
    WHERE e.cohort_id = s.cohort_id
      -- ⚠ ENROLLED only, deliberately. A PAUSED student cannot get into the
      -- programme, so "your class is on Tuesday" invites her to a door that
      -- will not open. The instalment-overdue email is the one that should
      -- be reaching her, and it does.
      AND e.status = 'ENROLLED'
      -- ⚠ Duplicated from enqueueEmail(), because this path never goes
      -- through it. Reserved addresses never accept mail, so every one is a
      -- guaranteed hard bounce, and dev holds 18 of them — a fan-out that hit
      -- them all would post a bounce rate that gets a low-volume Resend
      -- account flagged. Same guard, same reason, as migration 20260911120000.
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


-- =========================================================
-- 3. The nightly pass
-- =========================================================
-- ⚠ ITS OWN JOB, NOT A LOOP INSIDE nclex_enrolment_nightly_sweep(). The plan
-- doc says "a few more lines inside a job that already runs", and that reads
-- well until you notice the sweep is ONE TRANSACTION that also PAUSES
-- students for arrears. An exception raised while building a calendar
-- reminder would roll back the pauses — a bug in a nicety silently disabling
-- the money rule. The four existing cron jobs are already one-per-concern;
-- this is the fifth, and the isolation is free.
--
-- ⭐ THE WINDOW IS FORGIVING, AND THAT IS THE POINT — this is the opposite of
-- the instalment reminders, and the difference must be understood before
-- anyone copies one pattern to the other. Those had to tile their windows
-- exactly ("due in the next 24h", never "due today") because a missed night
-- meant somebody was NEVER warned and then paused. Here the fingerprint
-- answers "already told?", so a wide window, an overlapping window and a
-- missed night all self-correct: the next run simply picks up whoever has not
-- been told. Nothing slips.
--
-- Hence 7 days rather than 3. A week is long enough to swap a shift or
-- arrange childcare, which is the actual point of notice, and the width costs
-- nothing.

CREATE OR REPLACE FUNCTION nclex_session_reminder_sweep()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $sweep$
DECLARE
  r RECORD;
BEGIN
  IF COALESCE(
       (SELECT value FROM nclex_config WHERE key = 'session_reminders_enabled'),
       'true'
     ) = 'false' THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT ls.session_id
    FROM nclex_cohort_live_sessions ls
    WHERE ls.scheduled_at IS NOT NULL
      AND ls.scheduled_at >= now()
      AND ls.scheduled_at <  now() + interval '7 days'
    ORDER BY ls.scheduled_at
  LOOP
    PERFORM nclex_enqueue_session_reminders(r.session_id, FALSE);
  END LOOP;
END;
$sweep$;

REVOKE EXECUTE ON FUNCTION nclex_session_reminder_sweep() FROM PUBLIC, anon, authenticated;

INSERT INTO nclex_config (key, value, description)
VALUES (
  'session_reminders_enabled',
  'true',
  'Nightly live-class reminders (7-day window). Off = no reminder emails are queued.'
)
ON CONFLICT (key) DO NOTHING;

-- ⭐ 07:00, NOT 02:15 WITH THE OTHER JOBS (Sam, 2026-08-20). The first draft
-- put this a quarter hour behind the enrolment sweep, on the reasoning that
-- the overnight jobs should finish before anyone is awake. That reasoning is
-- right for the others and wrong for this one: they change STATE (pausing an
-- enrolment, expiring a pass) and nobody needs to witness the moment. This
-- one's entire output is a notification on somebody's phone, and Ghana is
-- GMT — so 02:15 buzzes a nurse at two in the morning about a class a week
-- away.
--
-- ⓘ The drain knocks every five minutes, so the reminder actually leaves at
-- roughly 07:05. The gap between "written" and "sent" is a property of the
-- queue, not of this schedule — which is exactly why the hour can be chosen
-- for the reader rather than for the machine.
SELECT cron.unschedule('nclex-session-reminders-nightly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nclex-session-reminders-nightly');

SELECT cron.schedule(
  'nclex-session-reminders-nightly',
  '0 7 * * *',
  $cron$ SELECT public.nclex_session_reminder_sweep(); $cron$
);


-- =========================================================
-- 4. The tutor's button
-- =========================================================
-- One case the nightly pass cannot reach: a student who joins on the MORNING
-- of a class, after last night's run. It also covers what no schedule can —
-- "we start in 30 minutes and the link has changed".
--
-- ⚠ ONE PER OCCURRENCE. The allowance is enforced by the SAME fingerprint the
-- nightly pass uses, so there is no counter and nothing to reset: a second
-- press inserts zero rows and returns 0.
--
-- ⭐ WHICH IS WHY IT RETURNS THE COUNT, AND WHY THE UI MUST SHOW IT. A tutor
-- who presses a live button and sees nothing happen is the third instance of
-- one bug in this codebase: nclex_submit_enquiry returns success while
-- dropping a repeat enquirer's message, and the pay-first receipt was refused
-- by the fingerprint while the caller was told nothing. Silence is not an
-- acceptable answer to a deliberate act.

-- ⚠⚠ RETURNS TWO NUMBERS, NOT ONE, AND THE SECOND IS THE POINT. "Queued 0"
-- has two completely different meanings and a tutor must never be handed the
-- wrong one:
--   • everyone eligible has already been told   → nothing to do, all is well
--   • the cohort has nobody we can email        → the class is unannounced
-- Reporting the first when the second is true tells a tutor her students
-- know about a class none of them has heard of.
--
-- ⭐ And the second case is NORMAL, not an edge one — it is the premise this
-- whole design rests on. Tutors set the timetable WHEN THEY CREATE THE
-- COHORT, before anyone has enrolled, so "send a reminder to an empty
-- cohort" is a thing a careful tutor will do in her first ten minutes.
-- (Found on 2026-08-20 while picking a cohort for Sam to test the button
-- on: five students, every one of them on a suppressed address.)
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

  IF v_when IS NULL THEN
    RAISE EXCEPTION 'This session has no date yet.';
  END IF;

  IF v_when < now() THEN
    RAISE EXCEPTION 'This class has already taken place.';
  END IF;

  -- ⚠⚠ THE BUTTON RESPECTS THE SWITCH TOO, and the first version did not.
  -- The reasoning for exempting it was that the switch means "stop the
  -- AUTOMATIC reminders" and a tutor pressing a button is a deliberate act,
  -- not automation. That is true of one of the switch's two jobs and false
  -- of the other:
  --
  --   editorial   "stop sending automatic reminders"        exemption is fine
  --   operational "this environment cannot render this yet"  exemption is a LIE
  --
  -- The second is not hypothetical — it is how a new environment is brought
  -- up, and the state dev sat in while this was built. There, an exempt
  -- button queues rows the Worker can only mark DEAD while telling the tutor
  -- "Reminder sent to 12 students".
  --
  -- ⭐ That is the same failure this slice has already fixed twice: the
  -- enquiry form's success tick over a dropped message, and the "queued 0"
  -- that could not tell "all done" from "nobody there". An exemption that
  -- can report success for an email that will never send is the same bug
  -- through the one door left open.
  --
  -- ⓘ The cost, accepted: an admin pausing the automation also silences
  -- tutors. Rarer than a botched deploy, and it fails as "the button says
  -- no" rather than "the button lies".
  IF COALESCE(
       (SELECT value FROM nclex_config WHERE key = 'session_reminders_enabled'),
       'true'
     ) = 'false' THEN
    RAISE EXCEPTION 'Live-class reminders are switched off for the whole site. An administrator can turn them back on in Admin settings.';
  END IF;

  -- Counted BEFORE the insert, and with the same two filters the builder
  -- uses, or the two numbers would answer slightly different questions.
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


-- =========================================================
-- 5. What the button should say before it is pressed
-- =========================================================
-- The outbox is not readable by a tutor's own client, and it should not
-- become so — it holds every email the product has ever sent to anyone. This
-- answers exactly one question about exactly one session, for its owner.

-- ⓘ Keyed by COHORT, not session, and returns a row per marker — so the
-- planner answers "which of these have been sent already" in one round-trip
-- rather than one call per session. Keyed by marker because that is what the
-- planner already holds for every row on the page.
--
-- ⚠ Counts ONLY the manual stage. The nightly rows share the fingerprint's
-- subject_ref but are not the tutor's allowance, and lumping them together
-- would show every class as "already sent" the moment it entered the 7-day
-- window — disabling the button exactly when it becomes useful.

CREATE OR REPLACE FUNCTION nclex_tutor_cohort_reminder_state(p_cohort_id UUID)
RETURNS TABLE (marker_activity_id UUID, manual_sent_at TIMESTAMPTZ, manual_count INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM nclex_cohorts    c
    JOIN nclex_programmes p ON p.programme_id = c.programme_id
    WHERE c.cohort_id = p_cohort_id
      AND p.tutor_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ls.marker_activity_id,
    MIN(o.created_at)::TIMESTAMPTZ,
    COUNT(*)::INTEGER
  FROM nclex_cohort_live_sessions ls
  JOIN nclex_email_outbox o
    ON o.event_key = 'session.reminder'
   AND o.subject_ref = ls.session_id::TEXT || '@'
                       || EXTRACT(EPOCH FROM ls.scheduled_at)::BIGINT::TEXT
   AND o.stage LIKE '%:manual'
  WHERE ls.cohort_id = p_cohort_id
    AND ls.scheduled_at IS NOT NULL
  GROUP BY ls.marker_activity_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION nclex_tutor_cohort_reminder_state(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION nclex_tutor_cohort_reminder_state(UUID) TO authenticated;
