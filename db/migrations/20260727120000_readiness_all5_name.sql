-- 20260727120000_readiness_all5_name.sql
--
-- Rename the READINESS_ALL5 product from "All 5" to "All packs".
--
-- Found by the live /readiness page (Slice ①.3): with three packs
-- published, the card headed "All 5" rendered the derived line "Unlocks
-- all 3 packs" directly beneath it. The code holds no hardcoded pack
-- count any more — but one survived in a database column an admin typed.
--
-- "All packs" is not immune, and we should be honest about that: a SKU's
-- `readiness_credits` and the published-pack count are two independently
-- editable numbers, so ANY name asserting a relationship between them can
-- drift. "All 5" breaks when the count falls below 5; "All packs" breaks
-- when it rises above the credit count. What it does buy is that the name
-- never states a WRONG NUMBER — the durable truth is the card's derived
-- line ("Unlocks all N packs" / "Pick any N of M packs"), which reads the
-- live count, and the admin page's amber advisory for unspendable credits.
--
-- The slug (`READINESS_ALL5`) is a locked identity field and does not
-- change — this is the same offer, not a different one. Only the display
-- name moves, so nothing sold under it is disturbed.
--
-- Idempotent, and scoped by product_id so it cannot touch a SKU an admin
-- has since renamed by hand.

UPDATE nclex_products
   SET name       = 'All packs',
       updated_at = NOW()
 WHERE product_id = 'READINESS_ALL5'
   AND name       = 'All 5';
