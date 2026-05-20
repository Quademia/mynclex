-- =========================================================
-- MyNclex — Slice 3a: programme price deltas + public-read RLS
-- File: mynclex/db/migrations/20260527120000_slice_3a_programme_price_deltas.sql
-- =========================================================
-- Payments & enrolment follow-on, Slice 3 (first step). Source:
--   docs/product-plan/design-handoff/payments-and-enrolment/index.html §1, §3
--   docs/product-plan/payments-and-enrolment.md (gap 4, 2026-05-19)
--
-- Replaces the programme's dual GHS/USD pricing with a single
-- tutor-chosen currency + price, and adds two policy columns the
-- later checkout / expiry slices read:
--
--   • price_currency        — 'GHS' | 'USD'. The tutor settles in one
--                             currency; the public listing shows that
--                             number. An FX "≈ equivalent" display is
--                             deferred polish (per the doc) — we do NOT
--                             store a second authored price. The bank
--                             keeps deliberate dual-currency PPP pricing
--                             on nclex_products; only the programme goes
--                             single-currency (tutor is one person, not
--                             a pricing department).
--   • price_minor           — single price in minor units. 0 = free.
--   • payment_collection_mode — OFF_PLATFORM (default) | ON_PLATFORM.
--                             No runtime effect until on-platform
--                             checkout (Slice 5); stored now so the
--                             tutor form sets it once.
--   • access_window_days    — NULL = "lifetime of tutor's sub"
--                             (Pattern A). Otherwise N days from
--                             nclex_enrolments.enrolled_at; the deferred
--                             EXPIRED/PAUSED pg_cron sweep reads this.
--
-- Backfill rule (per the proposal): non-zero column wins, GHS as the
-- tiebreaker (both dev rows are GHS today). Both-zero → GHS / 0 (free).
--
-- Plus the public-read RLS policy that unblocks discovery (Slice 3b/3c):
-- anon + authenticated can SELECT a programme iff it's PUBLISHED and its
-- tutor's account is active. Reads nclex_users via a SECURITY DEFINER
-- helper so the policy doesn't break for anon (nclex_users' own RLS is
-- authenticated-only) and doesn't recurse.
--
-- Whole thing runs in one transaction.

BEGIN;

-- ---------------------------------------------------------
-- 1. Add new columns (price cols nullable until backfilled)
-- ---------------------------------------------------------
ALTER TABLE nclex_programmes
  ADD COLUMN price_currency          TEXT,
  ADD COLUMN price_minor             INTEGER,
  ADD COLUMN payment_collection_mode TEXT NOT NULL DEFAULT 'OFF_PLATFORM'
                                     CHECK (payment_collection_mode IN ('OFF_PLATFORM','ON_PLATFORM')),
  ADD COLUMN access_window_days      INTEGER
                                     CHECK (access_window_days IS NULL OR access_window_days > 0);

-- ---------------------------------------------------------
-- 2. Backfill price_currency + price_minor from dual columns
-- ---------------------------------------------------------
UPDATE nclex_programmes SET
  price_currency = CASE
                     WHEN price_minor_ghs > 0 THEN 'GHS'
                     WHEN price_minor_usd > 0 THEN 'USD'
                     ELSE 'GHS'
                   END,
  price_minor    = CASE
                     WHEN price_minor_ghs > 0 THEN price_minor_ghs
                     WHEN price_minor_usd > 0 THEN price_minor_usd
                     ELSE 0
                   END;

-- ---------------------------------------------------------
-- 3. Lock the new price columns down
-- ---------------------------------------------------------
ALTER TABLE nclex_programmes
  ALTER COLUMN price_currency SET NOT NULL,
  ALTER COLUMN price_minor    SET NOT NULL,
  ADD CONSTRAINT nclex_programmes_price_currency_ok
    CHECK (price_currency IN ('GHS','USD')),
  ADD CONSTRAINT nclex_programmes_price_minor_ok
    CHECK (price_minor >= 0);

-- ---------------------------------------------------------
-- 4. Drop the old dual columns
-- ---------------------------------------------------------
ALTER TABLE nclex_programmes
  DROP COLUMN price_minor_ghs,
  DROP COLUMN price_minor_usd;

-- ---------------------------------------------------------
-- 5. Discovery filter index — collection mode on published rows
-- ---------------------------------------------------------
CREATE INDEX idx_nclex_programmes_collection_public
  ON nclex_programmes(payment_collection_mode)
  WHERE status = 'PUBLISHED';

-- ---------------------------------------------------------
-- 6. Tutor-active helper (SECURITY DEFINER — bypasses nclex_users RLS
--    so the public-read policy works for anon and can't recurse).
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION nclex_user_is_active(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM nclex_users u
    WHERE u.id = p_user_id AND u.is_active
  );
$$;

-- ---------------------------------------------------------
-- 7. Public-read RLS — anon + authenticated see PUBLISHED programmes
--    whose tutor is active. OR'd with the existing tutor/student/admin
--    SELECT policies (a logged-in student browsing discovery now also
--    sees published programmes they aren't enrolled in).
-- ---------------------------------------------------------
CREATE POLICY nclex_programmes_public_select ON nclex_programmes FOR SELECT
  TO anon, authenticated
  USING (status = 'PUBLISHED' AND nclex_user_is_active(tutor_id));

COMMIT;
