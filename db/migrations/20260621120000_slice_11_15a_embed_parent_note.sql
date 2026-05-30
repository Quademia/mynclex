-- =========================================================
-- MyNclex — Slice 11.15a: parent_note_id on the question tables
-- File: mynclex/db/migrations/20260621120000_slice_11_15a_embed_parent_note.sql
-- Depends on: 20260616120000_slice_11_1_tutor_library_schema.sql (notes)
-- =========================================================
-- Embedded-questions authoring lets a tutor create a question INLINE
-- from a library note. The question is a normal `nclex_tutor_questions`
-- row — fully reusable, builder-visible, published — that records where
-- it was first authored via a new `parent_note_id` column. This mirrors
-- the trend pattern (`trend_id` — one column on the question row, no
-- join table), NOT the case-study child pattern.
--
-- IMPORTANT — `parent_note_id` is an ORIGIN LABEL, not a visibility
-- gate. Unlike case-study / trend children (which are context-bound and
-- hidden via is_builder_visible=false), a note-authored question stays
-- visible and reusable in the bank, quizzes and other notes. The column
-- drives a "Note-created" chip + an optional bank filter, nothing more.
--
-- Added to BOTH question tables to preserve their existing column
-- symmetry (both already carry parent_case_id + trend_id). On
-- nclex_tutor_questions it links to a real note; on nclex_bank_items it
-- is a dormant placeholder until/unless QAcademy ever ships its own
-- notes. Plain nullable column, no FK — same loose-coupling shape as
-- trend_id, and note deletion (not yet built) will reconcile orphans
-- when it lands.
-- =========================================================

ALTER TABLE nclex_tutor_questions ADD COLUMN IF NOT EXISTS parent_note_id UUID;
ALTER TABLE nclex_bank_items       ADD COLUMN IF NOT EXISTS parent_note_id UUID;

-- Supports the "note-created" bank filter + future "questions born in
-- note X" lookups on the tutor surface (the only one with real notes).
CREATE INDEX IF NOT EXISTS idx_nclex_tutor_questions_parent_note
  ON nclex_tutor_questions(parent_note_id);

COMMENT ON COLUMN nclex_tutor_questions.parent_note_id IS
  'Origin label: the library note this question was first authored inline from (slice 11.15). NOT a visibility gate — the question stays builder-visible + reusable. NULL = authored in the general bank.';
COMMENT ON COLUMN nclex_bank_items.parent_note_id IS
  'Symmetry placeholder mirroring nclex_tutor_questions.parent_note_id (slice 11.15). Dormant until QAcademy introduces admin-side notes.';
