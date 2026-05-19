-- =========================================================
-- MyNclex — Drop keep-alive activity table
-- File: db/migrations/20260521120000_drop_keepalive_table.sql
-- =========================================================
-- Companion to db/migrations/20260512300000_keepalive_table.sql.
-- The keep-alive workflow that this table was created to feed was
-- never reliable (Supabase still sent pause-warning emails) and has
-- been removed (.github/workflows/keepalive-supabase.yml deleted).
-- Manual weekly login covers project activity now, so the table has
-- no remaining purpose.

DROP INDEX IF EXISTS idx_nclex_keepalive_pinged_at;
DROP TABLE IF EXISTS nclex_keepalive;
