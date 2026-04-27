-- =========================================================
-- MyNclex — Slice 1.11a: Case Study tab tables
-- File: mynclex/db/migrations/mynclex_case_study_tabs_slice_1_11a.sql
-- Depends on: nclex_case_studies, nclex_tutor_case_studies (schema.sql)
-- =========================================================
-- Replaces the 6 hardcoded JSONB tab columns on both case-study
-- tables with a flexible child-table model. One row per tab per
-- case, supporting the 6 built-ins plus curator-created custom
-- tabs in two shapes (free_text narrative, rows_cols structured).
-- =========================================================

-- 1. Drop the 6 hardcoded JSONB tab columns from admin case studies.
ALTER TABLE nclex_case_studies
  DROP COLUMN nurses_notes,
  DROP COLUMN vital_signs,
  DROP COLUMN lab_results,
  DROP COLUMN orders,
  DROP COLUMN history,
  DROP COLUMN diagnostics;

-- 2. Same 6 drops on the tutor twin.
ALTER TABLE nclex_tutor_case_studies
  DROP COLUMN nurses_notes,
  DROP COLUMN vital_signs,
  DROP COLUMN lab_results,
  DROP COLUMN orders,
  DROP COLUMN history,
  DROP COLUMN diagnostics;

-- 3. Admin case-study tabs child table.
CREATE TABLE nclex_case_study_tabs (
  tab_id        TEXT PRIMARY KEY,
  case_id       TEXT NOT NULL REFERENCES nclex_case_studies(case_id) ON DELETE CASCADE,

  -- Machine name. Built-in keys: nurses_notes / vital_signs / lab_results /
  -- orders / history / diagnostics. Custom keys: custom_narrative (Free text)
  -- or custom_grid (Rows & columns). Drives the editor + renderer choice.
  tab_key       TEXT NOT NULL,

  -- Curator-facing label; renamed independently of tab_key.
  title         TEXT NOT NULL,

  -- Position in the tab rail. Up/down arrows shift ±1.
  display_order INTEGER NOT NULL,

  -- Flag + shape discriminator for custom tabs.
  is_custom     BOOLEAN NOT NULL DEFAULT FALSE,
  custom_shape  TEXT,

  -- Only populated for custom_grid tabs. Shape: [{id: string, label: string}, ...].
  -- Built-in structured tabs get their columns from lib/bank/case-study/tab-types.ts.
  columns_def   JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Array of entry objects. Every entry has visible_from: 1..6 plus
  -- tab-shape-specific fields (time, body, bp, status, section, etc.).
  entries       JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (case_id, display_order),
  CHECK (tab_key <> ''),
  CHECK (display_order >= 0),
  CHECK (
    (is_custom = FALSE AND custom_shape IS NULL)
    OR
    (is_custom = TRUE  AND custom_shape IN ('free_text', 'rows_cols'))
  )
);

CREATE INDEX idx_nclex_case_study_tabs_case ON nclex_case_study_tabs(case_id);


-- 4. Tutor case-study tabs child table (same shape, FK to tutor cases).
CREATE TABLE nclex_tutor_case_study_tabs (
  tab_id        TEXT PRIMARY KEY,
  case_id       TEXT NOT NULL REFERENCES nclex_tutor_case_studies(case_id) ON DELETE CASCADE,

  tab_key       TEXT NOT NULL,
  title         TEXT NOT NULL,
  display_order INTEGER NOT NULL,

  is_custom     BOOLEAN NOT NULL DEFAULT FALSE,
  custom_shape  TEXT,
  columns_def   JSONB NOT NULL DEFAULT '[]'::jsonb,
  entries       JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (case_id, display_order),
  CHECK (tab_key <> ''),
  CHECK (display_order >= 0),
  CHECK (
    (is_custom = FALSE AND custom_shape IS NULL)
    OR
    (is_custom = TRUE  AND custom_shape IN ('free_text', 'rows_cols'))
  )
);

CREATE INDEX idx_nclex_tutor_case_study_tabs_case ON nclex_tutor_case_study_tabs(case_id);
