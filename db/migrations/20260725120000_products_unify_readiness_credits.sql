-- mynclex/db/migrations/20260725120000_products_unify_readiness_credits.sql
--
-- Readiness student Slice ① follow-on (settled with Sam 2026-07-08):
-- collapse readiness_pack_count + bundled_readiness_credits into ONE
-- column. Sam's catch — the two answered the same question in two
-- places.
--
--   readiness_pack_count      (READINESS SKUs)   1 / 3 / 5
--   bundled_readiness_credits (BANK_DURATION)    0 / 1 / 2 / 3 / 5
--
-- Both mean: "how many readiness credits does activating this product
-- MINT?" (§3 interaction rules — a bundled pack and a standalone pack
-- are granted by the identical credit mechanism; the SKU fixes the
-- COUNT, the student picks which packs). Where the credits came from —
-- the credit row's provenance — is derivable from pack_type, so the
-- second column carried no information.
--
-- Two concrete defects the split caused:
--   1. The (unbuilt) mint code would branch on pack_type to decide
--      WHICH column to read, for one number meaning one thing.
--   2. Illegal states were unguarded: a READINESS row could also carry
--      bundled_readiness_credits > 0 — mint 5, or 8? The DB never said.
--
-- Cheap now, expensive later: readiness_pack_count is read by NO code;
-- bundled_readiness_credits by exactly one display line
-- (app/(public)/bank-access/page.tsx). 9 rows. The credits table + mint
-- logic (next slice) will depend on whichever shape we land on.

-- ── 1. The unified column ────────────────────────────────────────────
ALTER TABLE nclex_products
  ADD COLUMN readiness_credits SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN nclex_products.readiness_credits IS
  'Readiness credits minted when this product activates. READINESS SKUs: the SKU IS the count (>=1). BANK_DURATION: free credits bundled with the pass (0 = none). Provenance comes from pack_type, not from a second column.';

-- ── 2. Backfill from whichever column was authoritative per type ─────
UPDATE nclex_products
   SET readiness_credits = COALESCE(readiness_pack_count, 0)
 WHERE pack_type = 'READINESS';

UPDATE nclex_products
   SET readiness_credits = COALESCE(bundled_readiness_credits, 0)
 WHERE pack_type <> 'READINESS';

-- ── 3. Guard the one genuinely illegal state ─────────────────────────
-- A readiness SKU granting nothing is a broken product. A bank pass
-- granting nothing is the normal case (30d, trial).
ALTER TABLE nclex_products
  ADD CONSTRAINT nclex_products_readiness_credits_positive
  CHECK (pack_type <> 'READINESS' OR readiness_credits >= 1);

-- ── 4. Retire the two old columns ────────────────────────────────────
ALTER TABLE nclex_products DROP COLUMN readiness_pack_count;
ALTER TABLE nclex_products DROP COLUMN bundled_readiness_credits;
