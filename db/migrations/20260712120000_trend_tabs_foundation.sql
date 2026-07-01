-- =========================================================
-- MyNclex — Trend rich multi-chart, Slice 1: trend tab tables
-- File: mynclex/db/migrations/20260712120000_trend_tabs_foundation.sql
-- Depends on: nclex_trend_datasets, nclex_tutor_trend_datasets (schema.sql)
-- =========================================================
-- Gives trend datasets a multi-tab chart child table, mirroring
-- nclex_case_study_tabs. This is the storage foundation for trend
-- adopting the case-study rich chart engine (planned in
-- docs/product-plan/questions-and-wrappers-rebuild.md → "Trend wrapper —
-- rich multi-chart").
--
-- ADDITIVE — nothing renders these tabs yet, and the existing flat-grid
-- columns (timepoints / rows) on the dataset rows are left untouched.
-- Converting the existing datasets into a seeded tab + retiring the dead
-- columns is a later, separate step (Slice 4).
-- =========================================================

-- 1. Admin trend tabs child table (mirror of nclex_case_study_tabs;
--    FK to the admin dataset, case_id → trend_id).
CREATE TABLE nclex_trend_tabs (
  tab_id        TEXT PRIMARY KEY,
  trend_id      TEXT NOT NULL REFERENCES nclex_trend_datasets(trend_id) ON DELETE CASCADE,

  -- Machine name. Built-in keys reuse the case-study set: nurses_notes /
  -- vital_signs / lab_results / orders / history / diagnostics. Custom
  -- keys: custom_narrative (Free text) or custom_grid (Rows & columns).
  -- Drives the editor + renderer choice.
  tab_key       TEXT NOT NULL,

  -- Curator-facing label; renamed independently of tab_key.
  title         TEXT NOT NULL,

  -- Position in the tab rail. Up/down arrows shift ±1.
  display_order INTEGER NOT NULL,

  -- Flag + shape discriminator for custom tabs.
  is_custom     BOOLEAN NOT NULL DEFAULT FALSE,
  custom_shape  TEXT,

  -- Only populated for custom_grid tabs. Shape: [{id, label}, ...].
  columns_def   JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- The v2 rich blob (merge-table list or narrative). Unlike case study,
  -- trend has no progressive disclosure — entries carry no meaningful
  -- visible_from (pinned to 1; the runner shows every tab at once).
  entries       JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (trend_id, display_order),
  CHECK (tab_key <> ''),
  CHECK (display_order >= 0),
  CHECK (
    (is_custom = FALSE AND custom_shape IS NULL)
    OR
    (is_custom = TRUE  AND custom_shape IN ('free_text', 'rows_cols'))
  )
);

CREATE INDEX idx_nclex_trend_tabs_trend ON nclex_trend_tabs(trend_id);


-- 2. Tutor trend tabs child table (same shape, FK to tutor datasets).
CREATE TABLE nclex_tutor_trend_tabs (
  tab_id        TEXT PRIMARY KEY,
  trend_id      TEXT NOT NULL REFERENCES nclex_tutor_trend_datasets(trend_id) ON DELETE CASCADE,

  tab_key       TEXT NOT NULL,
  title         TEXT NOT NULL,
  display_order INTEGER NOT NULL,

  is_custom     BOOLEAN NOT NULL DEFAULT FALSE,
  custom_shape  TEXT,
  columns_def   JSONB NOT NULL DEFAULT '[]'::jsonb,
  entries       JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (trend_id, display_order),
  CHECK (tab_key <> ''),
  CHECK (display_order >= 0),
  CHECK (
    (is_custom = FALSE AND custom_shape IS NULL)
    OR
    (is_custom = TRUE  AND custom_shape IN ('free_text', 'rows_cols'))
  )
);

CREATE INDEX idx_nclex_tutor_trend_tabs_trend ON nclex_tutor_trend_tabs(trend_id);


-- 3. RLS — mirrors nclex_case_study_tabs / nclex_tutor_case_study_tabs.
--    Admin: any authenticated user reads tabs whose parent dataset is
--    published; BANK_CURATE holders (SUPER_ADMIN via the helper
--    short-circuit) get full CRUD.
--    Tutor: only the owning tutor of the parent dataset, plus a
--    SUPER_ADMIN bypass for moderation. No public-read policy — tutor
--    content stays private until the runner lands enrolment-scoped
--    visibility.

ALTER TABLE nclex_trend_tabs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_tutor_trend_tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_trend_tabs_read_published ON nclex_trend_tabs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_trend_datasets td
      WHERE td.trend_id = nclex_trend_tabs.trend_id
        AND td.is_published = TRUE
    )
  );

CREATE POLICY nclex_trend_tabs_curate_all ON nclex_trend_tabs FOR ALL
  TO authenticated
  USING (nclex_user_has_permission('BANK_CURATE'))
  WITH CHECK (nclex_user_has_permission('BANK_CURATE'));

CREATE POLICY nclex_tutor_trend_tabs_tutor_own ON nclex_tutor_trend_tabs FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nclex_tutor_trend_datasets td
      WHERE td.trend_id = nclex_tutor_trend_tabs.trend_id
        AND td.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nclex_tutor_trend_datasets td
      WHERE td.trend_id = nclex_tutor_trend_tabs.trend_id
        AND td.tutor_id = auth.uid()
    )
  );

CREATE POLICY nclex_tutor_trend_tabs_superadmin ON nclex_tutor_trend_tabs FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));
