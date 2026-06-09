-- mynclex/db/migrations/20260701120000_quiz_tags.sql
--
-- Quiz tags — part 1 of the quiz-tags slice (authoring half).
--
-- Adds a free-text tag array to nclex_tutor_quizzes, mirroring the
-- exact column shape already on the question tables
-- (nclex_bank_items.tags / nclex_tutor_questions.tags): TEXT[] NOT
-- NULL DEFAULT '{}'. Tags are the tutor's own taxonomy for
-- identifying + searching their quizzes; the system doesn't
-- prescribe meaning.
--
-- Existing rows backfill to '{}' via the default. No RLS change —
-- a new column on an existing table is covered by the row-level
-- policies already on nclex_tutor_quizzes (tutor owns their own
-- quizzes; SUPER_ADMIN bypass).
--
-- No GIN index: the card display + list filter (parts 3 + 4) run
-- client-side over the already-loaded list, matching the question
-- tables (which also carry tags without a dedicated index). Add a
-- GIN index here if/when tag filtering moves server-side.

ALTER TABLE nclex_tutor_quizzes
  ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';
