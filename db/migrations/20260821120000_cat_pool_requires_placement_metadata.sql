-- An item reserved for CAT must be placeable by the CAT selector.
--
-- The selector needs two things from every item it can serve: a `difficulty`
-- band (§5 — to place the item on the ability ladder) and a
-- `client_needs_subcategory` (§8 — to hold the content blueprint). An item
-- missing either can be ticked into the reserved pool but can never actually
-- be selected, so it silently shrinks the usable pool below its nominal size.
--
-- That is exactly what had happened: 61 of the 2,400 reserved items were
-- unplaceable — 49 with no difficulty band, 27 with no subcategory, 15 with
-- neither. All 61 were real authored content, not the synthetic DEV_CAT_POOL
-- filler, which scored zero.
--
-- Triage before this constraint (2026-07-28):
--   * 7 rows that were not NCLEX questions at all (anatomy/biology drafts and
--     garbled fixtures) were cleared out of the pool and unpublished.
--   * 54 genuine questions were completed — 12 given the subcategory they
--     lacked, 42 given a difficulty band judged from the item, 9 of those
--     needing both.
--
-- Note the pool now stands at 2,393 rather than 2,400. Topping it back up is
-- deliberately NOT done here: 1,811 of the pool is `DEV_CAT_POOL` synthetic
-- scaffolding that never ships, so the dev figure is not a real editorial
-- reservation. The genuine 2,400 gets sized on the admin CAT-pool page in
-- Slice 10b2; restoring the count now would only have meant demoting seven
-- real items out of the free practice pool to satisfy a number that is mostly
-- test data.
--
-- (This header originally said "Slice 10a". It was written on a branch that
-- forked before 10a landed — 10a is the five-band difficulty work and is
-- built; pool sizing is 10b2/10b3.)

ALTER TABLE nclex_bank_items
  ADD CONSTRAINT nclex_bank_items_cat_pool_placeable_check
  CHECK (
    NOT cat_pool
    OR (difficulty IS NOT NULL AND client_needs_subcategory IS NOT NULL)
  );
