-- 20260922120000_programme_inactivity_nudge.sql
-- Slice B — progress.inactivity_nudge. The system chases the quiet student
-- so the tutor does not have to.
--
-- ⭐ WHY THIS EXISTS AT ALL. A self-paced programme only makes money because
-- it does not consume the tutor's hours. The Progress page (progress-engine.md
-- §6.4) shows who has gone quiet — but a screen that lists people to chase,
-- with nothing chasing them, quietly turns a low-touch product into a
-- high-touch one at a low-touch price. This is the half that keeps the
-- tutor's list short: the tutor should only be looking at the students the
-- automation already tried and failed to revive.
--
-- ⚠ PROGRAMME-SIDE, AND THE NAMES SAY SO (Sam, 2026-08-24). Every function
-- here is `nclex_programme_*`. These live in one flat namespace shared with
-- bank objects like nclex_refresh_item_response_stats, so the name is the
-- only thing recording which half of the product an object belongs to. A
-- future bank-inactivity nudge is a DIFFERENT machine — different table for
-- "who" (subscriptions, not enrolments), an inverted definition of "active"
-- (bank attempts are exactly what §6.4 excludes), and no tutor to write on
-- behalf of. It would reuse the queue and share nothing else.
--
-- Three objects, a switch and a cron entry:
--   1. nclex_programme_last_active()          the ONE definition of "last seen"
--   2. nclex_programme_nudge_history()        so the tutor can see we wrote
--   3. programme_inactivity_nudge_enabled     the admin off switch
--   4. nclex_programme_inactivity_nudge_sweep() the nightly pass
--
-- Doc: docs/product-plan/progress-engine.md §6.4,
--      docs/product-plan/transactional-email.md

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. The ONE definition of "last seen"
-- ─────────────────────────────────────────────────────────────────────────
-- ⭐ Written once, in SQL, and read by BOTH the nightly sweep and the tutor's
-- Progress page (lib/analytics/tutor/last-active.ts calls it). Two
-- implementations of one definition would drift, and the drift has a precise
-- cost: the screen says "Stalled" for a student the system never wrote to, or
-- the reverse. Two stories about the same person.
--
-- ⚠ SECURITY INVOKER, deliberately. The tutor's existing read policies on
-- progress rows, note state and attempts all resolve ownership by walking
-- activity → unit → programme → tutor, so they gate this correctly with no
-- new privilege surface; the cron job runs as `postgres` and bypasses RLS
-- anyway. Making it DEFINER would have created exactly the hole this repo
-- has already paid for once — a SECURITY DEFINER function written over a
-- table bypassing the column privileges that were guarding it.
--
-- ⚠ Deliberately NOT nclex_users.last_login_utc. It is product-wide, so a
-- student who also grinds the question bank looks permanently active on a
-- programme they abandoned in March. It answers "have they vanished
-- entirely", not "have they abandoned THIS programme".
CREATE OR REPLACE FUNCTION nclex_programme_last_active(p_programme_id UUID)
RETURNS TABLE (student_id UUID, last_active_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH prog_activities AS (
    -- Every activity under this programme, cohort-only rows included: for
    -- "did this person do anything here" they count, and on a self-paced
    -- programme none exist anyway.
    SELECT a.activity_id
    FROM nclex_programme_activities a
    JOIN nclex_programme_units u ON u.unit_id = a.unit_id
    WHERE u.programme_id = p_programme_id
  ),
  prog_notes AS (
    -- Notes reachable from this programme: attached directly, or a member
    -- of an attached shelf.
    SELECT att.note_id
    FROM nclex_tutor_library_note_attachments att
    WHERE att.activity_id IN (SELECT activity_id FROM prog_activities)
      AND att.note_id IS NOT NULL
    UNION
    SELECT m.note_id
    FROM nclex_tutor_library_note_attachments att
    JOIN nclex_tutor_library_shelf_memberships m ON m.shelf_id = att.shelf_id
    WHERE att.activity_id IN (SELECT activity_id FROM prog_activities)
      AND att.shelf_id IS NOT NULL
  ),
  events AS (
    -- (a) activity completions
    SELECT sp.student_id, sp.completed_at AS event_at
    FROM nclex_student_activity_progress sp
    WHERE sp.activity_id IN (SELECT activity_id FROM prog_activities)

    UNION ALL

    -- (b) library-note completions
    SELECT ns.student_id, ns.marked_done_at
    FROM nclex_library_note_state ns
    WHERE ns.note_id IN (SELECT note_id FROM prog_notes)
      AND ns.marked_done_at IS NOT NULL

    UNION ALL

    -- (c) ⭐ quiz-attempt engagement, which completion alone cannot see. A
    -- student halfway through a sitting they never submit has completed
    -- nothing and is plainly not silent. last_activity_at is a heartbeat
    -- written while the sitting is open; started_at / created_at are the
    -- fallbacks for a row that never got one.
    SELECT qa.student_id,
           GREATEST(qa.last_activity_at, COALESCE(qa.started_at, qa.created_at))
    FROM nclex_attempts qa
    WHERE qa.programme_id = p_programme_id
       OR (qa.programme_activity_id IS NOT NULL
           AND qa.programme_activity_id::uuid IN (SELECT activity_id FROM prog_activities))
  )
  SELECT e.student_id, MAX(e.event_at)
  FROM events e
  WHERE e.event_at IS NOT NULL
  GROUP BY e.student_id;
$$;

COMMENT ON FUNCTION nclex_programme_last_active(UUID) IS
  'The one definition of "last seen" on a programme — completions, note '
  'completions and quiz-attempt heartbeats, fused. Read by the tutor '
  'Progress page and by the nightly inactivity sweep, so the screen and the '
  'email cannot disagree. SECURITY INVOKER: existing RLS gates it.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. What the tutor is allowed to know about what we sent
-- ─────────────────────────────────────────────────────────────────────────
-- The outbox is admin-only (COMMS_MANAGE), and widening it is the wrong
-- shape: it holds EVERY email in the product, so a tutor policy would have
-- to be scoped by both ownership and event key and would still expose
-- payloads. This returns a TIMESTAMP and nothing else.
--
-- ⚠ SECURITY DEFINER, so the ownership re-check inside is MANDATORY, not
-- decorative. A column grant protects the table, not the functions written
-- over it — the first DEFINER RPC in this repo bypassed exactly that.
--
-- ⓘ "Nudged" means SENT, not queued. A row waiting on the drain has not
-- reached anybody yet, and telling a tutor we wrote when we have not is the
-- failure mode this is meant to prevent.
CREATE OR REPLACE FUNCTION nclex_programme_nudge_history(p_programme_id UUID)
RETURNS TABLE (enrolment_id UUID, last_nudged_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.enrolment_id, MAX(o.sent_at)
  FROM nclex_enrolments e
  JOIN nclex_email_outbox o
    ON o.subject_ref = e.enrolment_id::TEXT
   AND o.event_key = 'progress.inactivity_nudge'
   AND o.sent_at IS NOT NULL
  WHERE e.programme_id = p_programme_id
    -- ⚠ The re-check. Without it this function hands any authenticated
    -- caller the send history of every programme in the product.
    AND EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = p_programme_id
        AND (p.tutor_id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'))
    )
  GROUP BY e.enrolment_id;
$$;

REVOKE EXECUTE ON FUNCTION nclex_programme_nudge_history(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION nclex_programme_nudge_history(UUID) TO authenticated;

COMMENT ON FUNCTION nclex_programme_nudge_history(UUID) IS
  'Per-enrolment timestamp of the last inactivity nudge actually SENT, for '
  'one programme. Exposes a timestamp, never payload content. DEFINER with '
  'an ownership re-check inside.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. The off switch
-- ─────────────────────────────────────────────────────────────────────────
-- ⚠⚠ SEEDING THE ROW IS HALF THE JOB. The admin page renders CONFIG_DEFS in
-- app/(app)/admin/config/config-defs.ts, NOT this table — a key that exists
-- here and is not declared there is invisible on screen, and turning it off
-- would mean editing the database by hand, which is the exact thing these
-- switches exist to avoid. `email_drain_enabled` was missed this way on its
-- first pass. The matching entry ships in the same commit.
INSERT INTO nclex_config (key, value, description) VALUES
  ('programme_inactivity_nudge_enabled', 'true',
   'Nightly 08:00 pass that emails self-paced students who have gone quiet.')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. The nightly sweep
-- ─────────────────────────────────────────────────────────────────────────
-- ⚠⚠ THE FINGERPRINT IS THE ONLY THING STOPPING A DAILY EMAIL. An installment
-- reminder compares against a due DATE, so its rolling window and its
-- fingerprint are belt-and-braces. Inactivity has no date — "silent for 14
-- days" becomes true and then stays true forever — so the unique index on
-- (event_key, subject_ref, stage) is doing all of the work alone.
--
-- ⚠ And subject_ref here is a PERSON (an enrolment), which is precisely the
-- case where transactional-email.md's rule bites: the stage MUST name which
-- occurrence. With a stage of plain 'nudge' the second one would hit the
-- unique index and silently never send, reporting nothing.
--
-- ⭐ NUDGE 2 IS 30 DAYS AFTER NUDGE 1 WAS SENT — not an absolute silence
-- threshold. Anchoring it to silence (14 + 30 = 44 days) looks equivalent
-- and is not: a student already 50 days quiet when this ships would match
-- BOTH thresholds on the first run and receive two emails the same morning.
-- Chaining the second to the first is self-correcting — they get one now and
-- one in a month, which is the intent.
--
-- At most ONE row per enrolment per run, and at most TWO ever.
CREATE OR REPLACE FUNCTION nclex_programme_inactivity_nudge_sweep()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        RECORD;
  v_queued INTEGER := 0;
BEGIN
  -- The off switch. Same shape as the enrolment sweep's: a missing row
  -- reads as ON, so the feature works in an environment whose seed never
  -- ran. Returning 0 rather than raising keeps a disabled job
  -- indistinguishable from a quiet night in the cron log, which is what
  -- the other switches do too.
  IF COALESCE(
       (SELECT value FROM nclex_config WHERE key = 'programme_inactivity_nudge_enabled'),
       'true'
     ) <> 'true' THEN
    RETURN 0;
  END IF;

  FOR r IN
    WITH candidate AS (
      SELECT
        e.enrolment_id,
        e.user_id,
        e.enrolled_at,
        u.email        AS to_email,
        u.id           AS to_user_id,
        u.forename,
        p.programme_id,
        p.title        AS programme_title,
        t.name         AS tutor_name,
        la.last_active_at,
        -- No engagement ever → the clock runs from ENROLMENT instead.
        -- Without this a never-started student has no timestamp to measure
        -- and would either never fire or fire on the day they joined.
        COALESCE(la.last_active_at, e.enrolled_at) AS silent_since,
        CASE WHEN la.last_active_at IS NULL THEN 'NOT_STARTED' ELSE 'STALLED' END AS reason,
        n1.sent_at  AS nudge1_sent_at,
        n1.exists_at IS NOT NULL AS has_nudge1,
        n2.exists_at IS NOT NULL AS has_nudge2
      FROM nclex_enrolments e
      JOIN nclex_programmes p ON p.programme_id = e.programme_id
      JOIN nclex_users      u ON u.id = e.user_id
      JOIN nclex_users      t ON t.id = p.tutor_id
      LEFT JOIN nclex_tutors tt ON tt.user_id = p.tutor_id
      LEFT JOIN LATERAL (
        SELECT lat.last_active_at
        FROM nclex_programme_last_active(e.programme_id) lat
        WHERE lat.student_id = e.user_id
      ) la ON TRUE
      LEFT JOIN LATERAL (
        SELECT o.created_at AS exists_at, o.sent_at
        FROM nclex_email_outbox o
        WHERE o.event_key = 'progress.inactivity_nudge'
          AND o.subject_ref = e.enrolment_id::TEXT
          AND o.stage = 'nudge:1'
        LIMIT 1
      ) n1 ON TRUE
      LEFT JOIN LATERAL (
        SELECT o.created_at AS exists_at
        FROM nclex_email_outbox o
        WHERE o.event_key = 'progress.inactivity_nudge'
          AND o.subject_ref = e.enrolment_id::TEXT
          AND o.stage = 'nudge:2'
        LIMIT 1
      ) n2 ON TRUE
      WHERE
        -- Self-paced only in v1. Cohort students already hear from us weekly
        -- (session.reminder) and have a tutor running live classes who would
        -- notice; adding a nudge risks two emails a week to the people
        -- already hearing from us most. That is a volume decision, not a
        -- technical limit — dropping this line is most of what it would take.
            e.cohort_id IS NULL
        AND p.delivery_mode = 'SELF_PACED'
        -- ⚠ ENROLLED only, NOT paused. A paused student is locked out, not
        -- ignoring us; "pick up where you left off" to somebody who cannot
        -- get in is worse than silence.
        AND e.status = 'ENROLLED'
        AND (e.access_expires_at IS NULL OR e.access_expires_at > now())
        AND p.status = 'PUBLISHED'
        -- ⚠ Nothing goes out in a suspended tutor's name. Mirrors the guard
        -- in 20260920120000 (session reminders) and 20260919120000
        -- (collection); an absent tutor row fails closed, same as there.
        AND tt.status = 'APPROVED'
        -- Mirrors the @example.com guard in lib/email/outbox.ts. A sweep
        -- writes to the outbox directly, so the guard has to be repeated:
        -- those addresses never accept mail and dev seed data is full of
        -- them, so a table scan would post a ~90% bounce rate.
        AND lower(u.email) NOT LIKE '%@example.com'
        -- ⓘ Nothing left to resume → nothing to nudge about. Cheaper than
        -- computing a completion percentage: we only need to know that ONE
        -- visible activity is still outstanding.
        --
        -- ⚠ The three completion sources have to be branched, not merged.
        -- A LIBRARY_NOTE never has a progress row and a SHELF never has one
        -- either, so a single "no progress row → outstanding" test would
        -- mark every note and shelf permanently undone and nudge students
        -- who had genuinely finished. Mirrors doneFor() in
        -- lib/analytics/tutor/programme-queries.ts.
        AND EXISTS (
          SELECT 1
          FROM nclex_programme_activities a
          JOIN nclex_programme_units pu ON pu.unit_id = a.unit_id
          LEFT JOIN nclex_programme_blocks pb ON pb.block_id = a.block_id
          LEFT JOIN nclex_tutor_library_note_attachments att
                 ON att.activity_id = a.activity_id
          WHERE pu.programme_id = e.programme_id
            AND a.cohort_id IS NULL
            AND a.type <> 'ONLINE_LIVE_SESSION'
            AND a.is_published AND pu.is_published
            AND COALESCE(pb.is_published, TRUE)
            AND CASE
              -- A note is outstanding until it is marked done.
              WHEN a.type = 'LIBRARY_NOTE' THEN NOT EXISTS (
                SELECT 1 FROM nclex_library_note_state ns
                WHERE ns.student_id = e.user_id
                  AND ns.note_id = att.note_id
                  AND ns.marked_done_at IS NOT NULL
              )
              -- A shelf is outstanding while ANY non-skipped member note
              -- is still undone — the same rollup the student surface uses.
              WHEN a.type = 'SHELF' THEN EXISTS (
                SELECT 1
                FROM nclex_tutor_library_shelf_memberships m
                WHERE m.shelf_id = att.shelf_id
                  AND NOT COALESCE(att.skipped_note_ids, '[]'::jsonb)
                          @> to_jsonb(m.note_id::TEXT)
                  AND NOT EXISTS (
                    SELECT 1 FROM nclex_library_note_state ns2
                    WHERE ns2.student_id = e.user_id
                      AND ns2.note_id = m.note_id
                      AND ns2.marked_done_at IS NOT NULL
                  )
              )
              -- Everything else carries a progress row when done.
              ELSE NOT EXISTS (
                SELECT 1 FROM nclex_student_activity_progress sp
                WHERE sp.student_id = e.user_id
                  AND sp.activity_id = a.activity_id
              )
            END
        )
    )
    SELECT
      c.*,
      CASE
        -- ⚠ 14 HERE MUST EQUAL STALLED_AFTER_DAYS in
        -- lib/analytics/tutor/types.ts. The tutor's Progress page calls a
        -- student "Stalled" at that threshold; this email is what the page
        -- promises has already happened. Two numbers, one meaning — change
        -- them together or the screen starts describing a student the
        -- system never wrote to. (Deliberately NOT admin-configurable:
        -- Sam, 2026-08-24 — one switch, not a panel of dials.)
        WHEN NOT c.has_nudge1 AND c.silent_since <= now() - interval '14 days'
          THEN 'nudge:1'
        WHEN c.has_nudge1 AND NOT c.has_nudge2
             AND c.nudge1_sent_at IS NOT NULL
             AND c.nudge1_sent_at <= now() - interval '30 days'
          THEN 'nudge:2'
        ELSE NULL
      END AS stage
    FROM candidate c
  LOOP
    CONTINUE WHEN r.stage IS NULL;

    INSERT INTO nclex_email_outbox
      (event_key, subject_ref, stage, to_email, to_user_id, payload_json)
    VALUES (
      'progress.inactivity_nudge',
      r.enrolment_id::TEXT,
      r.stage,
      lower(r.to_email),
      r.to_user_id,
      jsonb_build_object(
        'recipientName',  r.forename,
        'programmeTitle', r.programme_title,
        'tutorName',      r.tutor_name,
        'programmeId',    r.programme_id,
        -- ⭐ The dial. One key, two tones: somebody who never began needs
        -- "here is how to start", somebody who stopped at unit 3 needs
        -- "carry on" — identical facts and identical intent, so §10's test
        -- for splitting a key ("shared facts, nothing else in common")
        -- fails and it stays one key.
        'reason',         r.reason,
        'silentDays',     GREATEST(0, EXTRACT(DAY FROM now() - r.silent_since)::INT),
        'nudgeNumber',    CASE WHEN r.stage = 'nudge:1' THEN 1 ELSE 2 END
      )
    )
    ON CONFLICT (event_key, subject_ref, stage) DO NOTHING;

    IF FOUND THEN
      v_queued := v_queued + 1;
    END IF;
  END LOOP;

  RETURN v_queued;
END;
$$;

REVOKE EXECUTE ON FUNCTION nclex_programme_inactivity_nudge_sweep()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION nclex_programme_inactivity_nudge_sweep() IS
  'Nightly: queues progress.inactivity_nudge for self-paced students who '
  'have gone quiet. At most one row per enrolment per run, two ever. Cron '
  'only — the API roles cannot call it.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5. The schedule
-- ─────────────────────────────────────────────────────────────────────────
-- 08:00, an hour after the session reminders, so the two pieces of
-- student-facing morning mail do not land in the same minute. The drain
-- (every 5 minutes) does the sending; this only writes rows.
SELECT cron.schedule(
  'nclex-programme-inactivity-nudge-nightly',
  '0 8 * * *',
  $cron$ SELECT public.nclex_programme_inactivity_nudge_sweep(); $cron$
);

COMMIT;
