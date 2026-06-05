-- mynclex/db/migrations/20260630120000_audit_log_bank.sql
--
-- Authorship / change history for the bank's authored content — Step 1
-- (data capture only; readout + timeline UI are later, no-DB steps).
--
-- Two append-only audit logs, split by realm to keep RLS simple and to
-- mirror the bank's parallel-ownership model:
--   • nclex_audit_log        — admin / QAcademy realm (gated by BANK_CURATE)
--   • nclex_tutor_audit_log  — tutor realm (scoped to owner_tutor_id, + SUPER_ADMIN)
--
-- Both tables share an IDENTICAL column set (per the "keep the tables
-- similar" convention): owner_tutor_id is always NULL on admin rows and
-- required on tutor rows. One row is written per create/edit and nothing
-- is ever overwritten, so "who created" and the full contributor history
-- are preserved permanently.
--
-- A single shared trigger function (nclex_write_audit) is wired to the
-- six content tables; each trigger passes that table's specifics as
-- arguments. Adding library / quizzes / programmes later is one extra
-- trigger line each against these same tables — no new schema.

-- ── Admin / QAcademy-realm log ──────────────────────────────────────
CREATE TABLE nclex_audit_log (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  action         TEXT NOT NULL CHECK (action IN ('created', 'updated')),
  -- Always NULL on admin rows; present purely for column-shape parity
  -- with the tutor log so shared read code sees one uniform shape.
  owner_tutor_id UUID REFERENCES nclex_users(id) ON DELETE SET NULL,
  changed_by     UUID REFERENCES nclex_users(id) ON DELETE SET NULL,
  -- Display name captured at write time (point-in-time): survives the
  -- person renaming or their account being deleted, and needs no lookup
  -- through nclex_users' locked-down RLS to display.
  changed_by_name TEXT,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX nclex_audit_log_entity_idx
  ON nclex_audit_log (entity_type, entity_id, changed_at DESC);

-- ── Tutor-realm log (identical columns; owner_tutor_id required) ─────
CREATE TABLE nclex_tutor_audit_log (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  action         TEXT NOT NULL CHECK (action IN ('created', 'updated')),
  -- Whose realm this row belongs to — drives RLS. Required here (a null
  -- owner would escape the per-tutor read gate). CASCADE: if the tutor's
  -- account is removed, their audit history goes with their realm.
  owner_tutor_id UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  -- Who actually made the change (the owner today; a co-tutor later).
  changed_by     UUID REFERENCES nclex_users(id) ON DELETE SET NULL,
  -- Display name captured at write time (point-in-time) — see admin log.
  changed_by_name TEXT,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX nclex_tutor_audit_log_entity_idx
  ON nclex_tutor_audit_log (entity_type, entity_id, changed_at DESC);
CREATE INDEX nclex_tutor_audit_log_owner_idx
  ON nclex_tutor_audit_log (owner_tutor_id, changed_at DESC);

-- ── Shared trigger function ─────────────────────────────────────────
-- Parameterised per table via the trigger arguments:
--   TG_ARGV[0] = entity_type label   (e.g. 'bank_item')
--   TG_ARGV[1] = the row's id column  (e.g. 'item_id')
--   TG_ARGV[2] = realm                ('admin' | 'tutor')
-- Reads the id (and, for tutor rows, the tutor_id owner) generically via
-- to_jsonb(NEW), so one function works across tables whose id column is
-- named differently. SECURITY DEFINER so it can append to the logs even
-- though end users have no write access to them — making the logs
-- append-only and tamper-proof.
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
  v_entity_id   TEXT := to_jsonb(NEW) ->> v_pk_column;
  v_action      TEXT := CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END;
  v_uid         UUID := auth.uid();
  v_name        TEXT;
BEGIN
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
       (to_jsonb(NEW) ->> 'tutor_id')::uuid, v_uid, v_name);
  ELSE
    INSERT INTO nclex_audit_log
      (entity_type, entity_id, action, changed_by, changed_by_name)
    VALUES
      (v_entity_type, v_entity_id, v_action, v_uid, v_name);
  END IF;
  RETURN NEW;
END;
$$;

-- ── Wire the function to the six content tables ─────────────────────
CREATE TRIGGER nclex_bank_items_audit
  AFTER INSERT OR UPDATE ON nclex_bank_items
  FOR EACH ROW EXECUTE FUNCTION nclex_write_audit('bank_item', 'item_id', 'admin');

CREATE TRIGGER nclex_case_studies_audit
  AFTER INSERT OR UPDATE ON nclex_case_studies
  FOR EACH ROW EXECUTE FUNCTION nclex_write_audit('case_study', 'case_id', 'admin');

CREATE TRIGGER nclex_trend_datasets_audit
  AFTER INSERT OR UPDATE ON nclex_trend_datasets
  FOR EACH ROW EXECUTE FUNCTION nclex_write_audit('trend_dataset', 'trend_id', 'admin');

CREATE TRIGGER nclex_tutor_questions_audit
  AFTER INSERT OR UPDATE ON nclex_tutor_questions
  FOR EACH ROW EXECUTE FUNCTION nclex_write_audit('tutor_question', 'item_id', 'tutor');

CREATE TRIGGER nclex_tutor_case_studies_audit
  AFTER INSERT OR UPDATE ON nclex_tutor_case_studies
  FOR EACH ROW EXECUTE FUNCTION nclex_write_audit('tutor_case_study', 'case_id', 'tutor');

CREATE TRIGGER nclex_tutor_trend_datasets_audit
  AFTER INSERT OR UPDATE ON nclex_tutor_trend_datasets
  FOR EACH ROW EXECUTE FUNCTION nclex_write_audit('tutor_trend_dataset', 'trend_id', 'tutor');

-- ── RLS — read-only to the right people; only the trigger writes ────
ALTER TABLE nclex_audit_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_tutor_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin log: any BANK_CURATE holder (SUPER_ADMIN included via the helper).
CREATE POLICY nclex_audit_log_read ON nclex_audit_log FOR SELECT
  USING (nclex_user_has_permission('BANK_CURATE'));

-- Tutor log: the owning tutor, plus SUPER_ADMIN for support / moderation.
CREATE POLICY nclex_tutor_audit_log_read ON nclex_tutor_audit_log FOR SELECT
  USING (owner_tutor_id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'));

-- No INSERT / UPDATE / DELETE policies on either log: end users can read
-- (scoped) but never write or alter the history. The SECURITY DEFINER
-- trigger above is the only writer, so the logs stay append-only.
