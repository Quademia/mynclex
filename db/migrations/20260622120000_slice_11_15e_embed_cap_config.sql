-- =========================================================
-- MyNclex — Slice 11.15e: embedded-questions cap config rows
-- File: mynclex/db/migrations/20260622120000_slice_11_15e_embed_cap_config.sql
-- Depends on: nclex_config (System Config key/value table)
-- =========================================================
-- The two embedded-questions limits become admin-tunable rows in
-- nclex_config, editable from the System Config page (no redeploy to
-- change a number). They're registered in
-- app/(app)/admin/config/config-defs.ts as `integer` settings with
-- guard rails (questions/block 1–30, blocks/note 1–10).
--
-- Seeded with the v1 defaults (10 / 5). ON CONFLICT DO NOTHING so a
-- re-run (or a value an admin has already changed) is never clobbered.
-- =========================================================

INSERT INTO nclex_config (key, value, description) VALUES
  ('embed_max_questions_per_block', '10',
   'Max questions a single embedded-questions block in a library note can hold (slice 11.15).'),
  ('embed_max_blocks_per_note', '5',
   'Max embedded-questions blocks a single library note can contain (slice 11.15).')
ON CONFLICT (key) DO NOTHING;
