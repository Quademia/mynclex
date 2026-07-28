-- ─────────────────────────────────────────────────────────────────────
-- CAT pool — regrain the reservation (correction to Slice 10b1)
-- ─────────────────────────────────────────────────────────────────────
-- 10b1 put `cat_pool` on three things: standalone questions, case
-- wrappers, and trend wrappers, with children inheriting their wrapper
-- by a join. Two corrections, both settled with Sam 2026-07-28.
--
-- ── 1. TREND DATASETS ARE NOT A RESERVATION UNIT ────────────────────
--
-- A trend dataset is not a selection unit ANYWHERE in the product. The
-- practice pool emits exactly two unit types, QUESTION and CASE
-- (`_nclex_eligible_unit_pool`); trend-linked questions travel in the
-- standalone branch on their own row. CAT picks them individually too,
-- capped at one per dataset per exam. There is no 'TREND' unit.
--
-- So a reservation on `nclex_trend_datasets` reserved something the
-- exam never picks. The column goes; each trend question carries its
-- own flag, exactly like any other standalone question. The dataset
-- keeps its role as a SCENARIO — the admin page counts how many
-- distinct datasets the reserved trend questions span, as a measure of
-- variety, not of supply.
--
-- This also matches how the same panel already describes the dataset's
-- builder-visibility flag: "No effect on trends — each question sets
-- its own builder visibility." `cat_pool` was the odd one out.
--
-- ── 2. CASE CHILDREN CARRY THE FLAG TOO ─────────────────────────────
--
-- A case IS a selection unit, so the reservation still lives on the
-- wrapper — but the children now carry a materialised copy, maintained
-- HERE rather than by app code. Two reasons:
--
--   • `cat_pool = TRUE` then means one thing on every row: "this
--     question is in the CAT pool". Selection (10b3) and every
--     practice-side exclusion can read one column instead of
--     remembering to join back to two wrapper tables. A forgotten join
--     is exactly how reserved stock leaks back into practice.
--   • Doing the cascade in a Server Action would put it in one save
--     path, and a second save path would eventually forget it. In the
--     database there is no second path.
--
-- The WRAPPER stays authoritative. Children are a copy the database
-- keeps in step: reserve/release cascades down, attaching a child
-- inherits, detaching clears.
--
-- ⚠ Known limitation, pre-existing and not introduced here: two tests
-- for "is this a case child" coexist — the `parent_case_id` column and
-- the `nclex_case_study_items` join table — and nothing keeps them in
-- sync. The cascade below keys on `parent_case_id`, because that is
-- the column on the row being written. A join-table row whose item has
-- a NULL `parent_case_id` is already invisible to the practice pool's
-- own exclusion, so it is not made worse here.
--
-- Tutor mirrors: `nclex_tutor_trend_datasets.cat_pool` is dropped to
-- keep the mirror symmetric. No cascade triggers are added on the
-- tutor tables — CAT runs against the admin bank only in v1, and those
-- columns are never read or written.

-- ── 0. the placeability CHECK applies to EDITORIAL reservations only ─
--
-- `nclex_bank_items_cat_pool_placeable_check` (20260821120000) requires
-- every reserved item to carry a difficulty band and a Client Needs
-- subcategory, because the selector cannot place it otherwise. That is
-- right for an item somebody ticked — and wrong for a case child, whose
-- flag is now derived from its wrapper rather than chosen.
--
-- The trap it would spring: the inherit trigger below re-asserts the
-- wrapper's value whenever a child is saved. If the wrapper is reserved
-- and the child is unplaceable, EVERY save of that child fails the
-- check — including the save that would add the missing band. The
-- curator is locked out of fixing the exact problem the constraint is
-- complaining about.
--
-- So the check narrows to individually-reserved rows: standalone
-- questions and trend questions, both of which the selector places on
-- its own. A case is placed as a block, so completeness is a property
-- of the CASE — gated in the reserve action and surfaced as an
-- "unplaceable" warning on the admin page's Audit lens, where a curator
-- can see and fix it, instead of as a write failure.
--
-- On dev this covers 8 rows, all missing a difficulty band (none
-- missing a subcategory): six children of NCLEX_CS_00002, one of
-- NCLEX_CS_00028, and one question under NCLEX_TRD_00004.

ALTER TABLE nclex_bank_items
  DROP CONSTRAINT nclex_bank_items_cat_pool_placeable_check;

ALTER TABLE nclex_bank_items
  ADD CONSTRAINT nclex_bank_items_cat_pool_placeable_check
  CHECK (
    NOT cat_pool
    OR parent_case_id IS NOT NULL
    OR (difficulty IS NOT NULL AND client_needs_subcategory IS NOT NULL)
  );

-- ── 1a. carry the trend reservations down before dropping ───────────
-- Any dataset currently reserved has its questions flagged individually,
-- so nothing silently leaves the pool.
--
-- A trend question IS placed individually, so the check still binds:
-- one unplaceable question (NCLEX_MCQ_91032, no difficulty band) is
-- skipped rather than failing the migration. Skipping is the honest
-- outcome — the selector could never have served it, so it was only
-- ever inflating the dataset's apparent supply.

UPDATE nclex_bank_items bi
   SET cat_pool = TRUE
  FROM nclex_trend_datasets td
 WHERE bi.trend_id = td.trend_id
   AND td.cat_pool  IS TRUE
   AND bi.cat_pool  IS NOT TRUE
   AND bi.difficulty                IS NOT NULL
   AND bi.client_needs_subcategory  IS NOT NULL;

-- ── 1b. the dataset stops being a reservation unit ──────────────────

ALTER TABLE nclex_trend_datasets       DROP COLUMN cat_pool;
ALTER TABLE nclex_tutor_trend_datasets DROP COLUMN cat_pool;

-- ── 2a. bring existing case children in line with their wrapper ─────
-- Both directions: a child of a reserved case gains the flag, and a
-- child carrying a stale flag under an unreserved case loses it. Before
-- 10b2 the editor's "never tick a child" rule was not actually being
-- enforced (the guard tested a mode that had been retired), so a child
-- may hold a flag nobody meant to set.

UPDATE nclex_bank_items bi
   SET cat_pool = cs.cat_pool
  FROM nclex_case_studies cs
 WHERE bi.parent_case_id = cs.case_id
   AND bi.cat_pool IS DISTINCT FROM cs.cat_pool;

-- ── 2b. reserve / release a case → its children follow ──────────────

CREATE OR REPLACE FUNCTION nclex_cat_pool_cascade_case()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE nclex_bank_items
     SET cat_pool = NEW.cat_pool
   WHERE parent_case_id = NEW.case_id
     AND cat_pool IS DISTINCT FROM NEW.cat_pool;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION nclex_cat_pool_cascade_case() IS
  'Cascades a case wrapper''s cat_pool onto its children. The wrapper is '
  'authoritative; children hold a materialised copy so selection can read '
  'one column instead of joining back to the wrapper.';

DROP TRIGGER IF EXISTS nclex_case_cat_pool_cascade_trg ON nclex_case_studies;
CREATE TRIGGER nclex_case_cat_pool_cascade_trg
AFTER UPDATE OF cat_pool ON nclex_case_studies
FOR EACH ROW
WHEN (OLD.cat_pool IS DISTINCT FROM NEW.cat_pool)
EXECUTE FUNCTION nclex_cat_pool_cascade_case();

-- ── 2c. attach a child → inherit; detach → clear ────────────────────
-- Fires whenever `parent_case_id` is written, which the question save
-- path does on every save of a case child. Re-asserting the wrapper's
-- value on each save is intended: a child's own flag is never a fact of
-- its own, so there is nothing to preserve.
--
-- Deliberately does NOT fire on the cascade above — that statement
-- writes only `cat_pool`, so `UPDATE OF parent_case_id` is not
-- triggered and the two cannot recurse.

CREATE OR REPLACE FUNCTION nclex_cat_pool_inherit_case()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wrapper BOOLEAN;
BEGIN
  IF NEW.parent_case_id IS NULL THEN
    -- Detached from a case: the reservation belonged to the wrapper, so
    -- it does not travel with the question. Without this, a detached
    -- child becomes a reserved standalone nobody ever ticked — it would
    -- vanish from student practice with no visible cause.
    IF TG_OP = 'UPDATE' AND OLD.parent_case_id IS NOT NULL THEN
      NEW.cat_pool := FALSE;
    END IF;
  ELSE
    SELECT cs.cat_pool INTO v_wrapper
      FROM nclex_case_studies cs
     WHERE cs.case_id = NEW.parent_case_id;
    NEW.cat_pool := COALESCE(v_wrapper, FALSE);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION nclex_cat_pool_inherit_case() IS
  'Keeps a case child''s cat_pool equal to its wrapper''s on attach, and '
  'clears it on detach. A child never holds a reservation of its own.';

DROP TRIGGER IF EXISTS nclex_item_cat_pool_inherit_trg ON nclex_bank_items;
CREATE TRIGGER nclex_item_cat_pool_inherit_trg
BEFORE INSERT OR UPDATE OF parent_case_id ON nclex_bank_items
FOR EACH ROW
EXECUTE FUNCTION nclex_cat_pool_inherit_case();
