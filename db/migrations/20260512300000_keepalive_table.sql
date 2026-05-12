-- =========================================================
-- MyNclex — Keep-alive activity table
-- File: mynclex/db/migrations/20260512300000_keepalive_table.sql
-- =========================================================
-- Supabase free-tier projects pause after ~7 days of inactivity.
-- The existing GitHub Action (.github/workflows/keepalive-supabase.yml)
-- pings GET /auth/v1/settings twice a week with the publishable
-- key. That's enough to prevent the actual pause (verified — no
-- mynclex project has ever paused), but Supabase still sends
-- "your project will be paused soon" warning emails — suggesting
-- the warning-email threshold uses a different activity metric
-- than the pause threshold, and /auth/v1/settings isn't sufficient
-- for it.
--
-- This table exists so the keep-alive path can move from a stateless
-- auth ping to a real database write (INSERT generates a WAL entry,
-- which is unambiguous "activity"). Two paths land here:
--
--   1. Direct DB inserts from a session (MCP execute_sql) — used as
--      a manual top-up while we measure whether warnings stop.
--   2. Future: the GitHub Action will INSERT here instead of (or
--      alongside) the auth ping, once service-role keys are added
--      as GH secrets. See the keepalive-supabase.yml comment for
--      the open task.
--
-- Decisions:
--   • No RLS policies. Only service-role (which bypasses RLS) can
--     read/write. The table is internal infrastructure, not
--     product data — anon/authenticated have no reason to touch it.
--   • Three columns only: id (PK), pinged_at (default NOW()),
--     source (free-text — caller declares 'github-actions' / 'mcp'
--     / 'manual' / etc).
--   • Index on pinged_at for the eventual periodic-cleanup query
--     (DELETE rows older than 30 days). Cleanup not added yet —
--     104 rows/year is trivial; revisit if disk usage matters.

CREATE TABLE nclex_keepalive (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pinged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source      TEXT
);

CREATE INDEX idx_nclex_keepalive_pinged_at
  ON nclex_keepalive(pinged_at);

ALTER TABLE nclex_keepalive ENABLE ROW LEVEL SECURITY;
-- No policies — anon and authenticated have no access. Service-role
-- bypasses RLS, which is the only path that needs to write here.
