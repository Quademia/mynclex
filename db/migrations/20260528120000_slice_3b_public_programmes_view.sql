-- =========================================================
-- MyNclex — Slice 3b: shared public-projection layer (programmes)
-- File: mynclex/db/migrations/20260528120000_slice_3b_public_programmes_view.sql
-- =========================================================
-- Payments & enrolment follow-on, Slice 3b. Establishes the ONE public
-- read path for programme data: the nclex_public_* view family. Every
-- public page (discovery list now; programme detail, waitlist, checkout
-- later) reads from these views and takes only the columns it needs —
-- so the "what's public" rule lives in one place and can't drift.
--
-- nclex_public_programmes — one row per publicly-visible programme, with
-- a curated projection: programme public fields + the tutor's PUBLIC
-- profile (name + avatar only — never email / phone / role) + a cohort
-- rollup (next upcoming open cohort + open-cohort count). The view runs
-- with owner rights (security_invoker = false, the default) so it can
-- expose this curated slice to anon without opening the underlying
-- nclex_users / nclex_cohorts tables, whose own RLS stays
-- authenticated-only.
--
-- Visibility gate (in the view, the single definition): status =
-- 'PUBLISHED' AND the tutor's account is active. The open-cohort
-- discovery rule (tutor-led needs >= 1 open cohort; self-paced always)
-- is NOT baked in here — it's a LIST filter, applied by the discovery
-- page on open_cohort_count. The detail page reads the same view by id
-- and ignores that filter (a published programme with no open cohort is
-- still viewable, just not enrollable).
--
-- Supersedes the 3a base-table public-read policy: now that the view is
-- the single public path, the nclex_programmes_public_select policy (and
-- its helper nclex_user_is_active, used only by that policy) are dropped
-- to avoid two mechanisms doing the same job.

BEGIN;

-- ---------------------------------------------------------
-- 1. Drop the 3a base-table public path (superseded by the view)
-- ---------------------------------------------------------
DROP POLICY IF EXISTS nclex_programmes_public_select ON nclex_programmes;
DROP FUNCTION IF EXISTS nclex_user_is_active(UUID);

-- ---------------------------------------------------------
-- 2. The public programmes window
-- ---------------------------------------------------------
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
  p.price_minor,
  p.show_price_publicly,
  p.payment_collection_mode,
  p.access_window_days,
  p.published_at,
  u.name        AS tutor_name,
  u.avatar_url  AS tutor_avatar_url,
  oc.next_cohort_start,
  COALESCE(oc.open_cohort_count, 0) AS open_cohort_count
FROM nclex_programmes p
JOIN nclex_users u ON u.id = p.tutor_id
LEFT JOIN LATERAL (
  -- "Open" = joinable: not cancelled, not yet ended, and either
  -- upcoming or in-progress with late-join allowed.
  SELECT
    MIN(c.start_date) FILTER (
      WHERE c.start_date >= CURRENT_DATE
    )                                    AS next_cohort_start,
    COUNT(*)                             AS open_cohort_count
  FROM nclex_cohorts c
  WHERE c.programme_id = p.programme_id
    AND c.cancelled_at IS NULL
    AND c.end_date >= CURRENT_DATE
    AND (c.start_date >= CURRENT_DATE OR c.allow_late_join)
) oc ON TRUE
WHERE p.status = 'PUBLISHED'
  AND u.is_active;

-- Public read access to the curated window (NOT the base tables).
GRANT SELECT ON nclex_public_programmes TO anon, authenticated;

COMMIT;
