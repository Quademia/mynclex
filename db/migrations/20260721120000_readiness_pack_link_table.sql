-- mynclex/db/migrations/20260721120000_readiness_pack_link_table.sql
--
-- Readiness packs Slice ① — storage foundation.
-- Plan: docs/product-plan/readiness-packs.md §6 + §12 (shape locked
-- 2026-07-07).
--
--   1. nclex_readiness_pack_items — the membership link table (one row
--      per question-in-a-pack, per-child rows for wrapper members).
--      Global UNIQUE(item_id): a question belongs to AT MOST ONE pack,
--      enforced by the database, not just the picker UI. The id is the
--      composite '<pack_id>:<item_id>' so an audit row's entity_id
--      names both halves even after the link row is deleted.
--   2. Drop nclex_readiness_packs.item_ids (superseded by the link
--      table) + .price_cents (superseded by the products catalogue).
--      Both empty — the table has never had a row.
--   3. Audit: widen the action CHECK with 'deleted' and teach
--      nclex_write_audit to log row DELETEs (removal is half of every
--      swap); wire the pack + link tables so membership history exists
--      from the first row.
--   4. RLS for both tables (was entirely OFF on nclex_readiness_packs
--      — planning-era gap): published packs readable by any
--      authenticated user (the future catalogue), BANK_CURATE manages;
--      the link table is curator-only (students meet members only via
--      frozen attempt snapshots).
--   5. Seed the 5 packs as drafts (§11.9) so earmarking has
--      destinations and the stock view can show per-pack fill.

-- ── 1. The membership link table ─────────────────────────────────────
CREATE TABLE nclex_readiness_pack_items (
  id          TEXT PRIMARY KEY,   -- '<pack_id>:<item_id>' (composite, audit-meaningful)
  pack_id     TEXT NOT NULL REFERENCES nclex_readiness_packs(pack_id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES nclex_bank_items(item_id) ON DELETE RESTRICT,
  position    INTEGER NOT NULL CHECK (position >= 1),   -- the sat order; completeness owned by the publish gate
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id),               -- one pack per question, DB-enforced (implies per-pack uniqueness)
  UNIQUE (pack_id, position)
);

-- ── 2. Drop the superseded pack-row columns ──────────────────────────
ALTER TABLE nclex_readiness_packs DROP COLUMN item_ids;
ALTER TABLE nclex_readiness_packs DROP COLUMN price_cents;

-- ── 3a. Audit action CHECK gains 'deleted' (both logs, shape parity) ─
ALTER TABLE nclex_audit_log
  DROP CONSTRAINT nclex_audit_log_action_check;
ALTER TABLE nclex_audit_log
  ADD CONSTRAINT nclex_audit_log_action_check
  CHECK (action IN ('created', 'updated', 'deleted'));

ALTER TABLE nclex_tutor_audit_log
  DROP CONSTRAINT nclex_tutor_audit_log_action_check;
ALTER TABLE nclex_tutor_audit_log
  ADD CONSTRAINT nclex_tutor_audit_log_action_check
  CHECK (action IN ('created', 'updated', 'deleted'));

-- ── 3b. nclex_write_audit learns DELETE ──────────────────────────────
-- Same function as 20260630120000 plus: on TG_OP = 'DELETE' the row
-- values come from OLD (NEW is null), the action is 'deleted', and we
-- RETURN OLD. Existing INSERT/UPDATE behaviour is unchanged, so the six
-- content-table triggers keep working as before.
CREATE OR REPLACE FUNCTION nclex_write_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_type TEXT := TG_ARGV[0];
  v_pk_column   TEXT := TG_ARGV[1];
  v_realm       TEXT := TG_ARGV[2];
  v_row         JSONB := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_entity_id   TEXT := NULL;
  v_action      TEXT := CASE TG_OP
                          WHEN 'INSERT' THEN 'created'
                          WHEN 'DELETE' THEN 'deleted'
                          ELSE 'updated'
                        END;
  v_uid         UUID := auth.uid();
  v_name        TEXT;
BEGIN
  v_entity_id := v_row ->> v_pk_column;

  -- Resolve the editor's display name once, here, at write time. Full
  -- name, falling back to email if the name is blank. SECURITY DEFINER
  -- lets us read nclex_users past its locked-down RLS. Stays NULL for
  -- system / seed writes (no logged-in user).
  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(u.name), ''), u.email)
      INTO v_name
      FROM nclex_users u
      WHERE u.id = v_uid;
  END IF;

  IF v_realm = 'tutor' THEN
    INSERT INTO nclex_tutor_audit_log
      (entity_type, entity_id, action, owner_tutor_id, changed_by, changed_by_name)
    VALUES
      (v_entity_type, v_entity_id, v_action,
       (v_row ->> 'tutor_id')::uuid, v_uid, v_name);
  ELSE
    INSERT INTO nclex_audit_log
      (entity_type, entity_id, action, changed_by, changed_by_name)
    VALUES
      (v_entity_type, v_entity_id, v_action, v_uid, v_name);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3c. Wire the pack + link tables (incl. DELETE) ───────────────────
-- The link row's id is '<pack_id>:<item_id>', so a 'deleted' audit row
-- still names both the pack and the removed question.
CREATE TRIGGER nclex_readiness_packs_audit
  AFTER INSERT OR UPDATE OR DELETE ON nclex_readiness_packs
  FOR EACH ROW EXECUTE FUNCTION nclex_write_audit('readiness_pack', 'pack_id', 'admin');

CREATE TRIGGER nclex_readiness_pack_items_audit
  AFTER INSERT OR UPDATE OR DELETE ON nclex_readiness_pack_items
  FOR EACH ROW EXECUTE FUNCTION nclex_write_audit('readiness_pack_item', 'id', 'admin');

-- ── 4. RLS ───────────────────────────────────────────────────────────
ALTER TABLE nclex_readiness_packs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_readiness_pack_items ENABLE ROW LEVEL SECURITY;

-- Packs: mirror of the bank-items audience split — any authenticated
-- user reads published packs (the future catalogue); BANK_CURATE
-- (SUPER_ADMIN via the helper) reads drafts + writes.
CREATE POLICY nclex_readiness_packs_read_published ON nclex_readiness_packs FOR SELECT
  TO authenticated
  USING (published = TRUE);

CREATE POLICY nclex_readiness_packs_curate_all ON nclex_readiness_packs FOR ALL
  TO authenticated
  USING (nclex_user_has_permission('BANK_CURATE'))
  WITH CHECK (nclex_user_has_permission('BANK_CURATE'));

-- Link rows: curator-only. Students never read memberships live — a
-- sitting reads the attempt's frozen rows; widen deliberately at the
-- student slices if a real need appears.
CREATE POLICY nclex_readiness_pack_items_curate_all ON nclex_readiness_pack_items FOR ALL
  TO authenticated
  USING (nclex_user_has_permission('BANK_CURATE'))
  WITH CHECK (nclex_user_has_permission('BANK_CURATE'));

-- ── 5. Seed the 5 draft packs ────────────────────────────────────────
-- Titles are working titles (editable in the admin surface). n = 100
-- questions, time limit = 12 000 s (3 h 20 m — the real exam's clock).
INSERT INTO nclex_readiness_packs (pack_id, title, n, time_limit_sec, published, status)
VALUES
  ('NCLEX_PACK_00001', 'Readiness Pack 1', 100, 12000, FALSE, 'draft'),
  ('NCLEX_PACK_00002', 'Readiness Pack 2', 100, 12000, FALSE, 'draft'),
  ('NCLEX_PACK_00003', 'Readiness Pack 3', 100, 12000, FALSE, 'draft'),
  ('NCLEX_PACK_00004', 'Readiness Pack 4', 100, 12000, FALSE, 'draft'),
  ('NCLEX_PACK_00005', 'Readiness Pack 5', 100, 12000, FALSE, 'draft');
