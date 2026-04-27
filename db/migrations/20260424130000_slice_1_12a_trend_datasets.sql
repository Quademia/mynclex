-- =========================================================
-- MyNclex — Slice 1.12a: Trend datasets
-- File: mynclex/db/migrations/mynclex_trend_datasets_slice_1_12a.sql
-- Applied: 2026-04-24 (dev — zrakjibtxyzoqcdtvpmq)
-- =========================================================
-- Creates the two new tables for the Trend wrapper's dataset layer:
--   • nclex_trend_datasets       — admin-owned, QAcademy bank
--   • nclex_tutor_trend_datasets — tutor-private, one per tutor
-- Plus RLS on both (mirrors the Slice 1.11a case-study block).
--
-- NOT added in this slice:
--   • trend_id FK column on nclex_bank_items / nclex_tutor_questions —
--     that lands in Slice 1.12b when attachment becomes a real
--     feature. Keeping the schema minimal until then.
--   • Transactional save RPC — 1.12a's save is a single-table write,
--     so no RPC needed yet.
--
-- Divergence from handoff:
--   • Handoff suggested CREATE TRIGGER … EXECUTE FUNCTION set_updated_at()
--     on both tables, asserting the helper already exists. It does
--     NOT — grep across mynclex/db/** turns up zero CREATE TRIGGER
--     and zero CREATE FUNCTION for updated_at. The repo's convention
--     is explicit `updated_at = NOW()` in every write path (see
--     upsertTabAction in case-study/actions.ts, the RPC's UPDATE
--     blocks, etc.). Following that convention here: no triggers,
--     and updateTrendAction (1.12a, this slice) will set
--     updated_at explicitly. If the trigger pattern gets added
--     later it can be attached to these tables too.
--   • Handoff SQL names `auth.users(id)` as the tutor_id FK target;
--     every existing tutor table in this repo uses
--     `nclex_users(id) ON DELETE CASCADE` — matching that
--     convention here.

-- ─────────────────────────────────────────────────────────
-- 1. Admin-owned trend datasets
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nclex_trend_datasets (
  trend_id      TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  scenario      TEXT,
  kind          TEXT NOT NULL,
  timepoints    JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows          JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────
-- 2. Tutor-private trend datasets
-- One row per tutor-authored dataset. tutor_id follows the
-- repo's existing tutor-table convention (FK to nclex_users,
-- cascade on delete). RLS binds visibility to the owner +
-- SUPER_ADMIN.
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nclex_tutor_trend_datasets (
  trend_id      TEXT PRIMARY KEY,
  tutor_id      UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  scenario      TEXT,
  kind          TEXT NOT NULL,
  timepoints    JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows          JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nclex_tutor_trend_datasets_tutor
  ON nclex_tutor_trend_datasets(tutor_id);


-- ─────────────────────────────────────────────────────────
-- 3. RLS — admin dataset
-- Read audience: any authenticated user (published only).
-- Write audience: BANK_CURATE permission holders; SUPER_ADMIN
-- bypasses via the nclex_user_has_permission helper's
-- short-circuit.
-- ─────────────────────────────────────────────────────────

ALTER TABLE nclex_trend_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_trend_datasets_read_published ON nclex_trend_datasets FOR SELECT
  TO authenticated
  USING (is_published = TRUE);

CREATE POLICY nclex_trend_datasets_curate_all ON nclex_trend_datasets FOR ALL
  TO authenticated
  USING (nclex_user_has_permission('BANK_CURATE'))
  WITH CHECK (nclex_user_has_permission('BANK_CURATE'));


-- ─────────────────────────────────────────────────────────
-- 4. RLS — tutor dataset
-- Read + write audience: the owning tutor only.
-- SUPER_ADMIN bypass for moderation / support.
-- No public-read: tutor datasets stay private until the
-- student runner introduces enrolment-scoped visibility.
-- ─────────────────────────────────────────────────────────

ALTER TABLE nclex_tutor_trend_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_tutor_trend_datasets_tutor_own ON nclex_tutor_trend_datasets FOR ALL
  TO authenticated
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY nclex_tutor_trend_datasets_superadmin ON nclex_tutor_trend_datasets FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));
