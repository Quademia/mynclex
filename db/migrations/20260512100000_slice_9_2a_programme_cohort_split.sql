-- =========================================================
-- MyNclex — Slice 9.2a: Programme/Cohort architecture split
-- File: mynclex/db/migrations/20260512100000_slice_9_2a_programme_cohort_split.sql
-- =========================================================
-- Splits the cohort-y bits out of nclex_programmes into a new
-- nclex_cohorts table, and adds the two curriculum-rework columns
-- (delivery_mode + unit_label) to nclex_programmes. The two-layer
-- model (programme = reusable design, cohort = one run) was settled
-- across two planning passes:
--   • 2026-05-10 — programme/cohort split (4 questions: layer model,
--     sync semantics, public discovery, naming).
--   • 2026-05-11 — curriculum architecture rework (blocks/units/dual
--     delivery modes/decoupled unit_label).
--
-- Source of truth for shape + semantics:
--   docs/product-plan/main.md (Programme structure, Cohort layer,
--                              Self-paced surface, Pricing)
--   docs/product-plan/curriculum-authoring-ux.md (delivery mode +
--                              unit label + curriculum rework)
--   docs/product-plan/payments-and-enrolment.md (price location,
--                              v1 deferrals)
--
-- Decisions confirmed in the slice planning conversation (2026-05-12):
--   • Pricing stays on programme. Cohort-level pricing variation
--     (early-bird, holiday promo) remains deferred to v2. Moving
--     pricing entirely to cohort would break self-paced (no cohort
--     layer); access-window pricing for self-paced is its own
--     unfinalised design queued for the self-paced enrolment slice.
--   • Cohort status is NOT stored — UPCOMING / IN_PROGRESS / ENDED
--     derive purely from (start_date, end_date, today). Only
--     CANCELLED is persisted, via cancelled_at IS NOT NULL.
--     Avoids drift; matches main.md §Cohort status semantics.
--   • This slice also lands minimum app rewiring (modal/card/queries)
--     so /tutor/programmes still loads. Real cohort UX (modal split,
--     Cohorts tab, cohort detail subtree) lands in slices 9.2b + 9.2c.
--
-- Backfill safety:
--   • All 7 existing dev rows have start/end/length values present;
--     each becomes one programme + one cohort pair. CANCELLED rows'
--     cancellation moves onto the cohort (cancelled_at) so no
--     historical fact is lost when programme.status drops CANCELLED.
--
-- Non-additive — drops three columns from nclex_programmes after
-- backfilling. INSERT order matters; do not reorder steps.


-- =========================================================
-- 1. nclex_programmes — additive: delivery_mode + unit_label
-- =========================================================

-- Delivery mode: drives whether the cohort layer applies. TUTOR_LED
-- programmes run as cohorts; SELF_PACED programmes enrol directly
-- with an access window (no cohort row). Both ship in v1.
-- Default 'TUTOR_LED' — all 7 pre-rework rows are tutor-led.
ALTER TABLE nclex_programmes
  ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'TUTOR_LED'
    CHECK (delivery_mode IN ('TUTOR_LED','SELF_PACED'));

-- Unit label: decoupled from delivery_mode per the 2026-05-11 rework.
-- Smart default at create-time: TUTOR_LED → WEEK, SELF_PACED → MODULE;
-- tutor can override. Editable later (pure label flip, no data
-- migration). Default 'WEEK' matches all existing TUTOR_LED rows.
ALTER TABLE nclex_programmes
  ADD COLUMN unit_label TEXT NOT NULL DEFAULT 'WEEK'
    CHECK (unit_label IN ('WEEK','MODULE'));


-- =========================================================
-- 2. nclex_programmes — rename length_weeks → length_units
-- =========================================================
-- Semantics shift: it's now a generic curriculum-unit count
-- (rendered as "Week N" or "Module N" per unit_label). Storage
-- identical. Constraint renamed alongside the column so the
-- generated name stays in sync.

ALTER TABLE nclex_programmes
  RENAME COLUMN length_weeks TO length_units;

ALTER TABLE nclex_programmes
  RENAME CONSTRAINT nclex_programmes_length_weeks_check
                 TO nclex_programmes_length_units_check;


-- =========================================================
-- 3. nclex_cohorts — new table
-- =========================================================

CREATE TABLE nclex_cohorts (
  cohort_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id     UUID NOT NULL
                   REFERENCES nclex_programmes(programme_id)
                   ON DELETE CASCADE,

  -- Display name override. NULL → UI auto-generates from dates
  -- ("5 Jan – 27 Mar 2027"); tutors override for variants like
  -- "Weekend Intensive".
  name             TEXT,

  -- Dates anchor the cohort. start_date is the cohort's week 1;
  -- end_date can extend bank access beyond the curriculum.
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,

  -- Seat cap. NULL = no cap.
  cohort_size      INTEGER
                   CHECK (cohort_size IS NULL OR cohort_size > 0),

  -- Late-join policy. OFF: enrolment closes at start_date.
  -- ON: tutor-controlled, no platform cutoff.
  allow_late_join  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Cancellation is the ONLY persisted lifecycle field. The other
  -- three statuses (UPCOMING / IN_PROGRESS / ENDED) derive from
  -- dates in TS via cohortStatus(cohort) — avoids drift, matches
  -- main.md §Cohort status semantics.
  cancelled_at     TIMESTAMPTZ,

  -- Audit
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT nclex_cohorts_dates_ok CHECK (end_date >= start_date)
);

-- Cohorts of a programme — drives the Cohorts tab list query
-- (slice 9.2c) and per-card cohort-count rollup (this slice).
CREATE INDEX idx_nclex_cohorts_programme
  ON nclex_cohorts(programme_id);


-- =========================================================
-- 4. Backfill — one cohort per existing programme
-- =========================================================
-- Preserves dates + seat cap on the cohort row. For CANCELLED
-- programmes, the cancellation moves to the cohort (cancelled_at)
-- so we don't lose that fact when programme.status drops CANCELLED
-- below.

INSERT INTO nclex_cohorts (
  programme_id,
  start_date,
  end_date,
  cohort_size,
  cancelled_at,
  created_at,
  updated_at
)
SELECT
  programme_id,
  start_date,
  end_date,
  cohort_size,
  CASE
    WHEN status = 'CANCELLED' THEN COALESCE(cancelled_at, NOW())
    ELSE NULL
  END,
  created_at,
  updated_at
FROM nclex_programmes;


-- =========================================================
-- 5. nclex_cohorts — RLS
-- =========================================================
-- Mirrors nclex_programmes via an ownership subquery: a tutor owns
-- a cohort iff they own the parent programme.

ALTER TABLE nclex_cohorts ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_cohorts_self_select ON nclex_cohorts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_cohorts.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohorts_self_insert ON nclex_cohorts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_cohorts.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohorts_self_update ON nclex_cohorts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_cohorts.programme_id
        AND p.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_programmes p
      WHERE p.programme_id = nclex_cohorts.programme_id
        AND p.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_cohorts_admin_all ON nclex_cohorts FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- 6. nclex_programmes — tighten status enum (drop CANCELLED)
-- =========================================================
-- Any current CANCELLED rows flip to ARCHIVED. The cohort
-- backfill above already captured the cancellation timestamp on
-- the new cohort, so no historical fact is lost.

UPDATE nclex_programmes
SET    status = 'ARCHIVED',
       archived_at = COALESCE(archived_at, cancelled_at, NOW())
WHERE  status = 'CANCELLED';

ALTER TABLE nclex_programmes
  DROP CONSTRAINT nclex_programmes_status_check;

ALTER TABLE nclex_programmes
  ADD CONSTRAINT nclex_programmes_status_check
    CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED'));


-- =========================================================
-- 7. nclex_programmes — drop cohort-y columns
-- =========================================================

ALTER TABLE nclex_programmes
  DROP CONSTRAINT nclex_programmes_dates_ok;

ALTER TABLE nclex_programmes DROP COLUMN start_date;
ALTER TABLE nclex_programmes DROP COLUMN end_date;
ALTER TABLE nclex_programmes DROP COLUMN cohort_size;
ALTER TABLE nclex_programmes DROP COLUMN cancelled_at;
