-- mynclex/db/migrations/20260726120000_products_full_price_and_single_trial.sql
--
-- Admin Products & Pricing (readiness-packs.md §12 slice ① part 2).
-- Two additions, both settled with Sam 2026-07-08.
--
-- 1. full_price_minor_{ghs,usd} — the optional "was" price.
--
--    price_minor_* KEEPS its meaning: the exact integer Paystack
--    charges. full_price_minor_* is the higher, DECORATIVE number a
--    sales card strikes through; the "% off" is DERIVED from the pair,
--    never stored. Rejected alternative: a stored discount_pct that
--    derives the charge — one percentage cannot express nice round
--    prices in two currencies at once (₵280 + $55), and a forgotten
--    percentage silently undercharges while the price column still
--    reads full. Here every charged number is one a human typed.
--
--    Consequence: NOTHING that takes money changes. init.ts / the
--    checkout pages / receipts all keep reading price_minor_*.
--
--    CHECK: when set, the full price must EXCEED the charged price —
--    a "was" that isn't higher is a lie, not a taste question, so it
--    blocks. Each currency is independent (a GHS-only promo is legal).
--
-- 2. One trial, enforced by the database. The admin create form guards
--    it too; this is the SQL half of the layered rule. Partial unique
--    index over kind='TRIAL' (see 20260724120000 — a trial is a free
--    BANK_DURATION pass, so `kind` is the only trial marker left).

-- ── 1. The optional "was" price ──────────────────────────────────────
ALTER TABLE nclex_products
  ADD COLUMN full_price_minor_ghs INTEGER,
  ADD COLUMN full_price_minor_usd INTEGER;

COMMENT ON COLUMN nclex_products.full_price_minor_ghs IS
  'Optional pre-offer price (minor units). NULL = not on offer. Decorative only: struck through on sales cards, never charged. Must exceed price_minor_ghs when set.';
COMMENT ON COLUMN nclex_products.full_price_minor_usd IS
  'Optional pre-offer price (minor units). NULL = not on offer. Decorative only: struck through on sales cards, never charged. Must exceed price_minor_usd when set.';

ALTER TABLE nclex_products
  ADD CONSTRAINT nclex_products_full_price_ghs_above_price
  CHECK (full_price_minor_ghs IS NULL OR full_price_minor_ghs > price_minor_ghs);

ALTER TABLE nclex_products
  ADD CONSTRAINT nclex_products_full_price_usd_above_price
  CHECK (full_price_minor_usd IS NULL OR full_price_minor_usd > price_minor_usd);

-- ── 2. At most one trial product ─────────────────────────────────────
CREATE UNIQUE INDEX idx_nclex_products_single_trial
  ON nclex_products ((kind))
  WHERE kind = 'TRIAL';
