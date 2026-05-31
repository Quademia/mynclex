-- 20260624130000_slice_11_13b_embed_play_id.sql
-- Slice 11.13b follow-on — the "play" (sitting) identifier.
--
-- A play_id groups every answer from a single run through ONE embed
-- block (a note with 2 blocks → 2 separate play_ids). It powers
-- per-sitting history ("last time: X of Y") and lets analytics tell
-- distinct attempts apart. Generated client-side when the student
-- clicks Start, stamped on every answer in that pass.
--
-- The table is empty, so the NOT NULL column adds cleanly with no
-- backfill. Every insert supplies a play_id (no default — a missing one
-- should fail loudly rather than silently group rows).

alter table nclex_library_embed_answers
  add column play_id uuid not null;

-- Load-path index: the player fetches a student's history for one block,
-- newest first, to compute the latest sitting's score.
create index if not exists nclex_library_embed_answers_play_idx
  on nclex_library_embed_answers (student_id, note_id, block_id, submitted_at desc);
