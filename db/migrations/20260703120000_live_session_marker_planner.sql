-- =========================================================
-- MyNclex — Live sessions: marker / planner split (Slice 1b)
-- File: mynclex/db/migrations/20260703120000_live_session_marker_planner.sql
-- =========================================================
-- A live session is an EVENT, not content. Its date, connection
-- details, and recording are PER-RUN — each cohort meets at its own
-- time, on its own link. Those fields lived (wrongly) on the
-- programme-TEMPLATE activity payload, so every cohort shared one
-- stale schedule.
--
-- This migration splits the two halves:
--   * TEMPLATE marker — the ONLINE_LIVE_SESSION activity keeps only
--     its identity + position + an optional "typical duration" hint
--     (payload gutted below to { typical_duration_minutes }).
--   * COHORT planner — a new per-(cohort, marker) table holds the
--     per-run schedule: date/time, connection details, recording.
--
-- A marker with NO planner row is "unscheduled" for that cohort; the
-- student sees "Date to be announced". The student viewer + tutor
-- Home read the schedule from here, never the template.
--
-- See docs/product-plan/live-session-planner.md.


-- =========================================================
-- 1. Planner table — nclex_cohort_live_sessions
-- =========================================================

CREATE TABLE nclex_cohort_live_sessions (
  session_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent cohort. CASCADE so deleting a cohort cleans up its
  -- schedules atomically.
  cohort_id            UUID NOT NULL
                       REFERENCES nclex_cohorts(cohort_id)
                       ON DELETE CASCADE,

  -- The live-session MARKER this schedule belongs to. CASCADE so
  -- deleting the marker (template or cohort-only) removes its
  -- schedule from every cohort.
  marker_activity_id   UUID NOT NULL
                       REFERENCES nclex_programme_activities(activity_id)
                       ON DELETE CASCADE,

  -- Per-run reality. All nullable so a tutor can fill them
  -- incrementally; "scheduled" (for the integrity cue in a later
  -- slice) means scheduled_at IS NOT NULL.
  scheduled_at         TIMESTAMPTZ,         -- UTC
  duration_minutes     INTEGER,             -- override; falls back to the marker's typical
  platform             TEXT
                       CHECK (platform IS NULL OR platform IN
                         ('ZOOM', 'GOOGLE_MEET', 'MS_TEAMS', 'OTHER')),
  join_url             TEXT,
  meeting_id           TEXT,
  passcode             TEXT,
  joining_instructions TEXT,
  recording_url        TEXT,                -- filled after the session airs

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One schedule per (cohort, marker).
  UNIQUE (cohort_id, marker_activity_id),

  CONSTRAINT nclex_cohort_live_sessions_duration_positive
    CHECK (duration_minutes IS NULL OR duration_minutes > 0)
);

CREATE INDEX idx_nclex_cohort_live_sessions_cohort
  ON nclex_cohort_live_sessions(cohort_id);
CREATE INDEX idx_nclex_cohort_live_sessions_marker
  ON nclex_cohort_live_sessions(marker_activity_id);

-- updated_at is stamped from the application layer on UPDATE — the
-- same pattern every other nclex_* table uses. No DB trigger.


-- =========================================================
-- 2. RLS
-- =========================================================
-- Tutor side: ownership chain schedule -> cohort -> programme ->
-- tutor (mirrors nclex_cohort_checklist_items). SUPER_ADMIN bypass.
-- Student side: an ACTIVELY enrolled student of the cohort may
-- SELECT its schedules (the student viewer reads them). Reuses the
-- SECURITY DEFINER helper nclex_has_active_cohort_enrolment from the
-- enrolment access-gating slice.

ALTER TABLE nclex_cohort_live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_cohort_live_sessions_self_select
  ON nclex_cohort_live_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_live_sessions.cohort_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_live_sessions_self_insert
  ON nclex_cohort_live_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_live_sessions.cohort_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_live_sessions_self_update
  ON nclex_cohort_live_sessions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_live_sessions.cohort_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_live_sessions.cohort_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_live_sessions_self_delete
  ON nclex_cohort_live_sessions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_cohorts c
      JOIN nclex_programmes p ON p.programme_id = c.programme_id
      WHERE c.cohort_id = nclex_cohort_live_sessions.cohort_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohort_live_sessions_student_select
  ON nclex_cohort_live_sessions FOR SELECT
  TO authenticated
  USING (nclex_has_active_cohort_enrolment(cohort_id));

CREATE POLICY nclex_cohort_live_sessions_admin_all
  ON nclex_cohort_live_sessions FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- 3. Gut the template payload down to the marker
-- =========================================================
-- The payload is JSONB (no DB shape enforcement) — these are data
-- moves. Order matters: drop self-paced live sessions first, then
-- reshape the survivors.

-- 3a. Self-paced programmes have no cohorts, so a live session there
-- has nowhere to be scheduled. Per the v1 decision, live sessions
-- are tutor-led-only. Remove any on a SELF_PACED programme (dev demo
-- data). Clear dependent progress rows first to dodge any FK
-- restriction.
DELETE FROM nclex_student_activity_progress sp
USING nclex_programme_activities a
  JOIN nclex_programme_units u ON u.unit_id = a.unit_id
  JOIN nclex_programmes p ON p.programme_id = u.programme_id
WHERE sp.activity_id = a.activity_id
  AND a.type = 'ONLINE_LIVE_SESSION'
  AND p.delivery_mode = 'SELF_PACED';

DELETE FROM nclex_programme_activities a
USING nclex_programme_units u, nclex_programmes p
WHERE a.unit_id = u.unit_id
  AND u.programme_id = p.programme_id
  AND a.type = 'ONLINE_LIVE_SESSION'
  AND p.delivery_mode = 'SELF_PACED';

-- 3b. Reshape the remaining (tutor-led) live-session payloads to the
-- marker shape: keep only typical_duration_minutes (carried from the
-- old duration_minutes); drop scheduled_at / join_url / recording_url
-- (now per-cohort planner fields). No schedules are migrated into
-- planner rows — dev data is throwaway and the old dates are past;
-- the tutor reschedules through the new Sessions tab.
UPDATE nclex_programme_activities
SET payload = CASE
      WHEN payload ? 'duration_minutes'
        THEN jsonb_build_object('typical_duration_minutes', payload->'duration_minutes')
      ELSE '{}'::jsonb
    END,
    updated_at = now()
WHERE type = 'ONLINE_LIVE_SESSION';
