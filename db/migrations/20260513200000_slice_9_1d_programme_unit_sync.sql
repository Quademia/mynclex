-- =========================================================
-- MyNclex — Slice 9.1d: Programme/unit auto-sync
-- File: mynclex/db/migrations/20260513200000_slice_9_1d_programme_unit_sync.sql
-- =========================================================
-- Defect fix. Closes a bug introduced 2026-05-10 with slice 9.1:
-- creating a programme inserts a row into nclex_programmes but
-- does not create the matching unit rows in
-- nclex_programme_units. The 9.3a migration backfilled units for
-- the 7 programmes that existed at the time, but nothing kept
-- the invariant
--
--   COUNT(nclex_programme_units WHERE programme_id = p) = p.length_units
--
-- true going forward — so every programme created after the
-- 9.3a deploy has an empty curriculum tab. Editing length_units
-- on an existing programme has the same shape of bug: the
-- programme row gets a new length value but the unit table is
-- never reconciled.
--
-- This migration installs the invariant at the DB layer:
--
--   1. AFTER INSERT trigger on nclex_programmes — seeds N empty
--      unit rows (unit_index 1..N) whenever a programme is
--      created.
--   2. AFTER UPDATE OF length_units trigger — reconciles the
--      unit count. Length increased → INSERT the missing rows.
--      Length decreased → DELETE the surplus rows (existing
--      ON DELETE CASCADE on blocks → unit and activities →
--      unit/block FKs handles their cleanup atomically).
--   3. One-time backfill — fills any programme whose current
--      count is short of length_units. No-op for the 7 already-
--      seeded programmes; catches any programme created since
--      9.3a.
--
-- Both trigger functions run SECURITY DEFINER so they bypass
-- RLS on nclex_programme_units. Justification: the trigger
-- only fires after a successful INSERT/UPDATE on
-- nclex_programmes, which is already RLS-gated to the row owner
-- (or SUPER_ADMIN). The trigger's bookkeeping is scoped to the
-- programme that was just modified — no privilege escalation
-- across rows. SECURITY DEFINER also future-proofs against any
-- later tightening of the unit-table RLS that might otherwise
-- silently break the trigger.
--
-- Application-layer destructive-action gating (type-to-confirm
-- before a length decrease that would delete content) lives in
-- the programme edit modal. The DB trigger is unconditional
-- once the UPDATE reaches it; the modal's job is to ensure no
-- unconfirmed destructive UPDATE leaves the client.


-- =========================================================
-- 1. Seed unit rows on programme INSERT
-- =========================================================

CREATE OR REPLACE FUNCTION nclex_programmes_seed_units()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO nclex_programme_units (programme_id, unit_index)
  SELECT NEW.programme_id, gs.idx
  FROM   generate_series(1, NEW.length_units) AS gs(idx);
  RETURN NEW;
END;
$$;

CREATE TRIGGER nclex_programmes_seed_units_trg
  AFTER INSERT ON nclex_programmes
  FOR EACH ROW
  EXECUTE FUNCTION nclex_programmes_seed_units();


-- =========================================================
-- 2. Reconcile unit rows on programme length_units UPDATE
-- =========================================================

CREATE OR REPLACE FUNCTION nclex_programmes_reconcile_units()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.length_units > OLD.length_units THEN
    -- Add the new tail (OLD+1 .. NEW). The existing
    -- UNIQUE (programme_id, unit_index) constraint on the units
    -- table guards against accidental duplicates if a future
    -- code path ever inserts ahead of the trigger.
    INSERT INTO nclex_programme_units (programme_id, unit_index)
    SELECT NEW.programme_id, gs.idx
    FROM   generate_series(OLD.length_units + 1, NEW.length_units) AS gs(idx);
  ELSIF NEW.length_units < OLD.length_units THEN
    -- Remove the surplus tail. FK ON DELETE CASCADE on the
    -- blocks (unit_id) and activities (unit_id + block_id) FKs
    -- cleans up everything inside the removed units atomically
    -- as part of this DELETE statement.
    DELETE FROM nclex_programme_units
    WHERE  programme_id = NEW.programme_id
      AND  unit_index > NEW.length_units;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER nclex_programmes_reconcile_units_trg
  AFTER UPDATE OF length_units ON nclex_programmes
  FOR EACH ROW
  WHEN (OLD.length_units IS DISTINCT FROM NEW.length_units)
  EXECUTE FUNCTION nclex_programmes_reconcile_units();


-- =========================================================
-- 3. One-time backfill — fill any currently-short programme
-- =========================================================
-- For every existing programme, ensure unit_index 1..length_units
-- all exist. UNIQUE (programme_id, unit_index) makes this idempotent
-- — re-running this query would no-op.

INSERT INTO nclex_programme_units (programme_id, unit_index)
SELECT p.programme_id, gs.idx
FROM   nclex_programmes p
CROSS  JOIN LATERAL generate_series(1, p.length_units) AS gs(idx)
WHERE  NOT EXISTS (
  SELECT 1
  FROM   nclex_programme_units u
  WHERE  u.programme_id = p.programme_id
    AND  u.unit_index = gs.idx
);
