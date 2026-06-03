-- 20260625130000_drop_cohort_checklist_seed_trigger.sql
-- Cohort checklist → live three-state model (decided 2026-06-01 with Sam;
-- see docs/product-plan/tutor-library.md / curriculum-authoring-ux.md).
--
-- The checklist is no longer a snapshot seeded at cohort creation. It is
-- now the LIVE programme template, where a checklist row is only an
-- OVERRIDE (inclusion + dates) created on the tutor's first explicit
-- action. Absence of a row = "unconfigured" (rendered with defaults; not
-- shown to students). So the seed-on-cohort-creation trigger is retired.
--
-- Existing seeded rows are LEFT IN PLACE — they're valid overrides
-- (is_included = true) and simply read as "included" going forward. No
-- backfill, no data loss. New cohorts start with everything unconfigured;
-- the tutor uses "Include all" to bulk-configure.

BEGIN;

DROP TRIGGER IF EXISTS nclex_cohorts_seed_checklist_trg ON nclex_cohorts;
DROP FUNCTION IF EXISTS nclex_cohorts_seed_checklist();

COMMIT;
