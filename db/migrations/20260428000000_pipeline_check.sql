-- =========================================================
-- Stage 9 end-to-end check — verifies the prod migration pipeline.
-- File: db/migrations/20260428000000_pipeline_check.sql
-- =========================================================
-- Pure no-op. SELECT 1 is harmless — no schema change, no data
-- change. Purpose is to prove the GitHub Action picks up new
-- migrations from db/migrations/, applies them via supabase db push,
-- and records the version in supabase_migrations.schema_migrations.
-- After this lands on prod, expect a new tracker row with
-- version = 20260428000000.

SELECT 1;
