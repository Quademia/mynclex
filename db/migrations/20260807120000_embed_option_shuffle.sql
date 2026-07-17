-- =========================================================
-- MyNclex — Embed player option shuffle (option B: persist the order)
-- File: mynclex/db/migrations/20260807120000_embed_option_shuffle.sql
-- =========================================================
-- The in-note embedded-questions player runs its OWN option shuffle, separate
-- from the attempt-side trigger (the embed player never touches
-- nclex_attempt_items — it reads bank content live and logs here). Decision
-- (Sam 2026-07-17, option B): persist the per-play display order so a past
-- sitting's review replays EXACTLY the order the student saw, independent of
-- the shuffle algorithm — and so it extends cleanly to more question types.
--
-- The order is a deterministic permutation seeded on (play_id, item_id): the
-- client computes it to display, the server (submitEmbedAnswer) re-derives the
-- same order and stores it here alongside the frozen question snapshot. NULL =
-- no shuffle for this row (pre-migration rows, TF, or a shuffle_options=false
-- question) → review falls back to the snapshot's authored order.
--
-- Shape mirrors the attempt-side option_order_json: an array of option ids in
-- display order for the flat types (MCQ/SATA/SELECT_N); an object keyed by pool
-- when the player later gains the multi-pool types (CLOZE/BOWTIE).
-- =========================================================

alter table nclex_library_embed_answers
  add column if not exists option_order_json jsonb;

comment on column nclex_library_embed_answers.option_order_json is
  'Per-play display permutation of the options (option shuffle, option B). Deterministic from (play_id, item_id); NULL = authored order. Array for flat types, object keyed by pool for multi-pool types.';
