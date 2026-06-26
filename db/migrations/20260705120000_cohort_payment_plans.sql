-- =========================================================
-- MyNclex — Cohort-level payment plans (per-cohort override)
-- File: mynclex/db/migrations/20260705120000_cohort_payment_plans.sql
-- =========================================================
-- Designed 2026-06-22 (payments-and-enrolment.md → "Designed 2026-06-22 —
-- cohort-level payment plans"). A cohort can carry its OWN payment-plan set
-- instead of the programme's. Same Option-A pattern as cohort-specific
-- activities: a nullable cohort_id on the strategies table —
--   cohort_id IS NULL  = the programme default (every existing row),
--   cohort_id = <id>    = that cohort's own plan (clone-and-edit).
-- "Custom" is simply "the cohort has its own rows"; checkout reads the
-- cohort's effective plans (its rows if any, else the programme defaults).
-- The chosen plan is still frozen onto the enrolment at checkout, so this
-- never touches existing enrolments — only future ones.
--
-- Slice 1 of 3 (schema + reads). No RLS change: the base-table policy keys on
-- parent-programme ownership and a cohort row still carries its programme_id,
-- so the owning tutor is already covered.

BEGIN;

ALTER TABLE nclex_programme_payment_strategies
  ADD COLUMN cohort_id UUID REFERENCES nclex_cohorts(cohort_id) ON DELETE CASCADE;

-- Replace UNIQUE(programme_id, kind) with two scoped partial unique indexes:
-- one programme-default per kind, one cohort-override per kind.
DROP INDEX IF EXISTS idx_nclex_pps_programme_kind;
CREATE UNIQUE INDEX idx_nclex_pps_programme_kind
  ON nclex_programme_payment_strategies (programme_id, kind)
  WHERE cohort_id IS NULL;
CREATE UNIQUE INDEX idx_nclex_pps_cohort_kind
  ON nclex_programme_payment_strategies (cohort_id, kind)
  WHERE cohort_id IS NOT NULL;

-- Reads of a cohort's plans go by cohort_id + sort_order.
CREATE INDEX idx_nclex_pps_cohort_sort
  ON nclex_programme_payment_strategies (cohort_id, sort_order)
  WHERE cohort_id IS NOT NULL;

-- The public checkout view now exposes cohort_id so the picker can read a
-- cohort's effective plans. cohort_id is APPENDED at the end of the column
-- list — CREATE OR REPLACE VIEW requires existing columns to keep their
-- order; only additions at the end are allowed. The gate is unchanged
-- (active plan, PUBLISHED programme, active tutor).
CREATE OR REPLACE VIEW nclex_public_payment_strategies AS
SELECT
  s.strategy_id,
  s.programme_id,
  s.kind,
  s.label,
  s.total_price_minor,
  s.initial_price_minor,
  s.installment_count,
  s.installment_interval_days,
  s.balance_due_days_after_enrolment,
  s.sort_order,
  s.cohort_id
FROM nclex_programme_payment_strategies s
JOIN nclex_programmes p ON p.programme_id = s.programme_id
JOIN nclex_users u ON u.id = p.tutor_id
WHERE s.is_active
  AND p.status = 'PUBLISHED'
  AND u.is_active;

GRANT SELECT ON nclex_public_payment_strategies TO anon, authenticated;

-- The discovery headline price is derived from a programme's plans; it must
-- stay the PROGRAMME default, so scope the three strategy subqueries to
-- cohort_id IS NULL — else a cohort override would skew the public listing.
-- Same output columns (only the subquery WHERE clauses change), so
-- CREATE OR REPLACE is valid.
CREATE OR REPLACE VIEW nclex_public_programmes AS
SELECT
  p.programme_id,
  p.title,
  p.tagline,
  p.description,
  p.delivery_mode,
  p.unit_label,
  p.length_units,
  p.price_currency,
  p.show_price_publicly,
  p.payment_collection_mode,
  p.access_window_days,
  p.published_at,
  u.name           AS tutor_name,
  u.avatar_url     AS tutor_avatar_url,
  oc.next_cohort_start,
  COALESCE(oc.open_cohort_count, 0) AS open_cohort_count,
  u.public_profile AS tutor_profile,
  COALESCE(
    (SELECT s.total_price_minor
       FROM nclex_programme_payment_strategies s
      WHERE s.programme_id = p.programme_id
        AND s.cohort_id IS NULL
        AND s.kind = 'UPFRONT_FULL'
        AND s.is_active
      LIMIT 1),
    (SELECT MIN(s.initial_price_minor)
       FROM nclex_programme_payment_strategies s
      WHERE s.programme_id = p.programme_id
        AND s.cohort_id IS NULL
        AND s.is_active),
    0
  )                AS headline_price_minor,
  EXISTS (
    SELECT 1
      FROM nclex_programme_payment_strategies s
     WHERE s.programme_id = p.programme_id
       AND s.cohort_id IS NULL
       AND s.kind = 'UPFRONT_FULL'
       AND s.is_active
  )                AS headline_is_upfront
FROM nclex_programmes p
JOIN nclex_users u ON u.id = p.tutor_id
LEFT JOIN LATERAL (
  SELECT
    MIN(c.start_date) FILTER (WHERE c.start_date >= CURRENT_DATE)
                                         AS next_cohort_start,
    COUNT(*)                             AS open_cohort_count
  FROM nclex_cohorts c
  WHERE c.programme_id = p.programme_id
    AND c.cancelled_at IS NULL
    AND c.end_date >= CURRENT_DATE
    AND (c.start_date >= CURRENT_DATE OR c.allow_late_join)
) oc ON TRUE
WHERE p.status = 'PUBLISHED'
  AND u.is_active;

GRANT SELECT ON nclex_public_programmes TO anon, authenticated;

COMMIT;
