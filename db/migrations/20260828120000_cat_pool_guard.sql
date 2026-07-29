-- ─────────────────────────────────────────────────────────────────────
-- CAT §20.5 — reserving is sealed in the database, not in each caller
-- ─────────────────────────────────────────────────────────────────────
-- bank-consumption-cat.html §20.5 / §20.6.
--
-- Reserving stock for CAT carries three obligations beyond setting the
-- flag: the row leaves the practice builder (`is_builder_visible`), it
-- stops being a public free sample (`is_free_sample`), and it must not
-- also be sold inside a readiness pack. Until now all three lived in ONE
-- caller — the admin reserve drawer's Server Action — and every other
-- path that can set `cat_pool` skipped them.
--
-- ── The three doors ─────────────────────────────────────────────────
--
--   1. The standalone editor's "Reserve for CAT" tick
--      (lib/bank/actions/save-question.ts) writes `cat_pool` bare.
--   2. The case-wrapper editor's tick
--      (lib/bank/wrappers/case-study/actions.ts) does the same.
--   3. The drawer's own SERVER ACTION, for cases. Its readiness-pack
--      re-check covers only targets of kind `item` — and that check
--      exists precisely because the item path does not trust the UI
--      ("Check the live link table rather than trusting what the drawer
--      displayed"). Cases got no equivalent, so the case path trusts the
--      page. Reserving a case cascades `cat_pool` onto all six children
--      with no server-side pack check anywhere in the path.
--
-- Door 3 needs stating precisely, because the first reading of it was
-- wrong. The drawer's UI *does* grey a case whose child is in a pack:
-- lib/bank/cat-pool/queries.ts rolls child pack membership up into the
-- wrapper's `readinessTagged`. A curator cannot click those cases today.
-- What is missing is the server-side re-check the item path has — so a
-- stale page, or a pack edited in another tab between load and submit,
-- goes straight through. The UI rollup also counts only PUBLISHED
-- children, so a pack member that is an unpublished child would not grey
-- its case at all (zero such rows today, but nothing prevents one).
--
-- That is the case for a trigger rather than a fourth copy of the rules
-- in TypeScript: four paths can set this flag, three of them skip some
-- part of the contract, and the database is the only layer all four pass
-- through. Zero rows violate any of it today — the point is that only a
-- disabled button was stopping them.
--
-- ── What the trigger does ───────────────────────────────────────────
--
-- On any write that leaves `cat_pool` true:
--   • forces `is_builder_visible` false,
--   • forces `is_free_sample` false,
--   • (items only) REFUSES the write if the row is a readiness-pack
--     member, naming the item and the pack.
--
-- Forcing rather than rejecting the two flags is deliberate: a curator
-- ticking "Reserve for CAT" has stated an intention the flags merely
-- follow from, so making them agree is completing the instruction, not
-- overriding it. Pack membership is different — that is two intentions
-- in genuine conflict, and only a human can say which wins.
--
-- ⚠ `is_free_sample` is forced on CASES too, which the drawer never did
-- (it clears the flag for items only). The column exists on both and the
-- reasoning is identical — a free sample is public shop window, and a
-- reserved question must not be met before the exam. That is a gap
-- closed, not a behaviour copied.
--
-- The six-placeable-children rule is deliberately NOT here. It stays in
-- the drawer where it can explain what is wrong, and the placeability
-- CHECK exempts case children on purpose so the cascade cannot make a
-- child unsaveable.
--
-- Cases need no pack check of their own: the cascade updates each child,
-- each child fires the item trigger, and a pack-member child aborts the
-- whole transaction — so the case cannot be reserved either, and the
-- error names the offending child rather than the case.
--
-- ── ⚠ The trigger NAME is load-bearing ──────────────────────────────
--
-- Postgres fires same-event row triggers in ALPHABETICAL order, and
-- `nclex_item_cat_pool_inherit_trg` is what copies a child's `cat_pool`
-- down from its parent case. This guard must run AFTER it, or on an
-- INSERT it would inspect the value before inheritance and wave through
-- a child that is about to become reserved.
--
--   nclex_item_cat_pool_inherit_trg   ← runs first  ("i")
--   nclex_item_cat_pool_seal_trg      ← runs second ("s")
--
-- "seal" is chosen purely because it sorts after "inherit". Renaming it
-- to something tidier that sorts earlier would silently disable it on
-- exactly the path that matters. Do not rename without checking.
-- ─────────────────────────────────────────────────────────────────────

-- ── Items ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nclex_cat_pool_seal_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_pack TEXT;
BEGIN
  -- Checked in the body rather than a WHEN clause so the value read is
  -- whatever the inherit trigger has already settled on.
  IF NEW.cat_pool IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT pi.pack_id INTO v_pack
  FROM nclex_readiness_pack_items pi
  WHERE pi.item_id = NEW.item_id
  LIMIT 1;

  IF v_pack IS NOT NULL THEN
    RAISE EXCEPTION
      'cat_pool: % is in readiness pack % — a question cannot be both reserved for CAT and sold in a pack (CAT §20.5)',
      NEW.item_id, v_pack
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.is_builder_visible := FALSE;
  NEW.is_free_sample     := FALSE;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS nclex_item_cat_pool_seal_trg ON public.nclex_bank_items;
CREATE TRIGGER nclex_item_cat_pool_seal_trg
  BEFORE INSERT OR UPDATE ON public.nclex_bank_items
  FOR EACH ROW EXECUTE FUNCTION nclex_cat_pool_seal_item();

-- ── Case wrappers ────────────────────────────────────────────────────
-- No pack check: a case is not a pack member. Its children are covered
-- transitively through the cascade.
CREATE OR REPLACE FUNCTION public.nclex_cat_pool_seal_case()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.cat_pool IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  NEW.is_builder_visible := FALSE;
  NEW.is_free_sample     := FALSE;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS nclex_case_cat_pool_seal_trg ON public.nclex_case_studies;
CREATE TRIGGER nclex_case_cat_pool_seal_trg
  BEFORE INSERT OR UPDATE ON public.nclex_case_studies
  FOR EACH ROW EXECUTE FUNCTION nclex_cat_pool_seal_case();
