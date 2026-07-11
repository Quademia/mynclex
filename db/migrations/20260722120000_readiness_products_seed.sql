-- mynclex/db/migrations/20260722120000_readiness_products_seed.sql
--
-- Readiness student Slice ① (readiness-packs.md §12, re-cut
-- 2026-07-08) — seed the 3 standalone READINESS SKUs settled in §3
-- (2026-05-17). No schema change: nclex_products shipped with full
-- readiness support in the payments arc (pack_type, pack count, dual
-- currency); these are the first rows to use it.
--
-- Prices are minor units (pesewas / cents). The SKU fixes the CREDIT
-- COUNT only — which packs the student claims is chosen post-purchase
-- (§3 interaction rules). sort_order continues the catalogue's
-- sequence (trial 0, bank tiers 1–5).
--
-- ON CONFLICT DO NOTHING: idempotent, and prod-safe if a row was ever
-- hand-created there first.

INSERT INTO nclex_products
  (product_id, name, kind, pack_type, duration_days,
   readiness_pack_count, bundled_readiness_credits,
   price_minor_ghs, price_minor_usd, status, sort_order)
VALUES
  ('READINESS_SINGLE',  'Single Pack', 'PAID', 'READINESS', NULL, 1, 0, 10000, 2000, 'ACTIVE', 6),
  ('READINESS_SELECT3', 'Select 3',    'PAID', 'READINESS', NULL, 3, 0, 24000, 4800, 'ACTIVE', 7),
  ('READINESS_ALL5',    'All 5',       'PAID', 'READINESS', NULL, 5, 0, 35000, 7000, 'ACTIVE', 8)
ON CONFLICT (product_id) DO NOTHING;
