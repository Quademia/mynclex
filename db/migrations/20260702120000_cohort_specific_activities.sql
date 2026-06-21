-- =========================================================
-- MyNclex — Cohort-specific activities, Slice 1: schema
-- File: mynclex/db/migrations/20260702120000_cohort_specific_activities.sql
-- =========================================================
-- Adds the cohort-only "escape valve" foundation: a nullable
-- cohort_id tag on the two curriculum content tables.
--
--   cohort_id IS NULL  → TEMPLATE row (shared by every cohort of the
--                        programme) — the existing behaviour.
--   cohort_id = <id>   → COHORT-ONLY row (belongs to that one run;
--                        never propagates to any other cohort).
--
-- Design: docs/product-plan/cohort-specific-activities.md (Option A —
-- a cohort-only activity is an ordinary nclex_programme_activities row
-- scoped to one cohort, reusing every existing editor + render path;
-- the cohort tag is the only thing that distinguishes it).
--
-- This migration ships only the column + indexes. The matching
-- discipline filter (`cohort_id IS NULL` on every programme-template
-- read; `cohort_id IS NULL OR cohort_id = <this cohort>` on the cohort
-- checklist) lands in the same slice at the application layer.
-- Cohort-only BLOCKS + reference types are later slices; the column
-- lands on _blocks now so those slices stay app-layer only (no second
-- migration).
--
-- RLS: no change needed.
--   - Tutor CRUD: a cohort-only row hangs off a TEMPLATE unit
--     (unit_id -> programme -> tutor), so the existing owner-scoped
--     unit->programme->tutor policies already cover it.
--   - Student SELECT: the existing *_student_select policies gate on
--     "parent programme is PUBLISHED" with no cohort filter, so they
--     already admit cohort-tagged rows. The per-cohort scoping is done
--     in the TS delivery layer (students read activities THROUGH the
--     cohort checklist, which is cohort-keyed) -- same posture as
--     template activities.
--
-- Seed trigger: none to touch. nclex_cohorts_seed_checklist was retired
-- in 20260625130000 (the three-state live-checklist model), so a new
-- cohort no longer auto-seeds checklist rows and cannot scoop up another
-- cohort's cohort-only activities.
--
-- ON DELETE CASCADE: cohorts are soft-cancelled (cancelled_at) in v1,
-- not hard-deleted, so this rarely fires. When a cohort IS deleted, its
-- cohort-only content belongs to it and should go too -- CASCADE does
-- that, and the checklist rows follow via their own cohort_id FK.

BEGIN;

-- Activities: the leaf content rows. NULL = template, set = cohort-only.
ALTER TABLE nclex_programme_activities
  ADD COLUMN cohort_id UUID NULL
    REFERENCES nclex_cohorts(cohort_id) ON DELETE CASCADE;

-- Blocks: cohort-only blocks arrive in Slice 2, but the column ships now
-- so that slice is app-layer only (no second migration).
ALTER TABLE nclex_programme_blocks
  ADD COLUMN cohort_id UUID NULL
    REFERENCES nclex_cohorts(cohort_id) ON DELETE CASCADE;

-- Partial indexes -- only cohort-only rows carry a non-NULL cohort_id,
-- and the cohort-scoped reads (checklist, student delivery) filter on
-- `cohort_id = <id>`. Partial keeps the index tiny (every template row
-- is excluded); the `cohort_id IS NULL` half of those reads is served by
-- the existing unit_id indexes.
CREATE INDEX idx_nclex_programme_activities_cohort
  ON nclex_programme_activities(cohort_id)
  WHERE cohort_id IS NOT NULL;

CREATE INDEX idx_nclex_programme_blocks_cohort
  ON nclex_programme_blocks(cohort_id)
  WHERE cohort_id IS NOT NULL;

COMMIT;
