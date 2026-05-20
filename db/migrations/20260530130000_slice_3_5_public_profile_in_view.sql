-- =========================================================
-- MyNclex — Slice 3.5: expose tutor public_profile in the public view
-- File: mynclex/db/migrations/20260530130000_slice_3_5_public_profile_in_view.sql
-- =========================================================
-- Adds the tutor's public_profile bag to nclex_public_programmes as a
-- single JSONB column (tutor_profile). The whole bag is exposed because
-- it is public-display data by rule (slice 3.5) — so the discovery card
-- and detail page can render the tutor's headline / bio / business
-- branding. Exposing the bag (not individual columns) means future
-- field additions need no view change — only the TS type evolves.
--
-- security_invoker stays false (owner rights), same as the rest of the
-- view family: anon reads the curated slice without the base
-- nclex_users RLS opening up. CREATE OR REPLACE keeps existing grants.

BEGIN;

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
  u.name           AS tutor_name,
  u.avatar_url     AS tutor_avatar_url,
  oc.next_cohort_start,
  COALESCE(oc.open_cohort_count, 0) AS open_cohort_count,
  -- Appended at the end: CREATE OR REPLACE VIEW only allows new columns
  -- at the tail (it can't reorder existing ones). Readers use SELECT *
  -- so position is irrelevant.
  u.public_profile AS tutor_profile
FROM nclex_programmes p
JOIN nclex_users u ON u.id = p.tutor_id
LEFT JOIN LATERAL (
  -- "Open" = joinable: not cancelled, not yet ended, and either
  -- upcoming or in-progress with late-join allowed.
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
