-- =========================================================
-- MyNclex — Payments Slice 7e: retire nclex_programmes.price_minor
-- File: mynclex/db/migrations/20260612120000_slice_7e_retire_programme_price_minor.sql
-- =========================================================
-- The final step of Phasing 2 (see BUILD_LIST §"Blast radius of retiring
-- price_minor"). Slice 7a introduced nclex_programme_payment_strategies as
-- the real source of truth for amounts and seeded one UPFRONT_FULL row per
-- programme (total = initial = price_minor). Since then, syncUpfrontStrategy
-- kept the two copies in lockstep so the public surfaces could keep reading
-- the simple column while installments, deposits, schedule + sweep all read
-- from the strategies table. Two copies = drift risk, so this slice deletes
-- the column. The strategies table is now the only place a price lives.
--
-- The public view family used p.price_minor for the headline. We replace
-- that with a derived projection: the active UPFRONT_FULL plan's total when
-- offered, otherwise the cheapest first payment across other active plans
-- (so a tutor offering installments-only still has a headline). A second
-- derived column flags which case we're in so the discovery card can prefix
-- "from " when the headline is a deposit/first installment, not a full price.
--
-- Order matters: drop the view first (CREATE OR REPLACE can't remove a
-- column from a view), recreate it without p.price_minor + with the derived
-- headline, then drop the column on the base table.

BEGIN;

-- ---------------------------------------------------------
-- 1. Drop the view (column removal requires DROP, not REPLACE)
-- ---------------------------------------------------------
DROP VIEW IF EXISTS nclex_public_programmes;

-- ---------------------------------------------------------
-- 2. Recreate the view, swapping price_minor for the derived headline
-- ---------------------------------------------------------
-- Headline rule:
--   • If an active UPFRONT_FULL plan exists → its total_price_minor.
--   • Else, the MIN(initial_price_minor) across other active plans
--     (the cheapest first payment the student would be charged).
--   • Else, 0 → the UI shows "Contact for price" / disables Enrol.
-- headline_is_upfront flags case 1 vs case 2 so the discovery card can
-- prefix "from " on case 2 (honest signal: that's a first payment, not the
-- full price).
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
        AND s.kind = 'UPFRONT_FULL'
        AND s.is_active
      LIMIT 1),
    (SELECT MIN(s.initial_price_minor)
       FROM nclex_programme_payment_strategies s
      WHERE s.programme_id = p.programme_id
        AND s.is_active),
    0
  )                AS headline_price_minor,
  EXISTS (
    SELECT 1
      FROM nclex_programme_payment_strategies s
     WHERE s.programme_id = p.programme_id
       AND s.kind = 'UPFRONT_FULL'
       AND s.is_active
  )                AS headline_is_upfront
FROM nclex_programmes p
JOIN nclex_users u ON u.id = p.tutor_id
LEFT JOIN LATERAL (
  -- "Open" = joinable: not cancelled, not yet ended, and either upcoming or
  -- in-progress with late-join allowed.
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

-- ---------------------------------------------------------
-- 3. Drop the column (no more readers after step 2)
-- ---------------------------------------------------------
ALTER TABLE nclex_programmes
  DROP COLUMN price_minor;

COMMIT;
