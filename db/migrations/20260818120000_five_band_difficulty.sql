-- ─────────────────────────────────────────────────────────────────────
-- CAT Slice 10a — five-band difficulty
-- ─────────────────────────────────────────────────────────────────────
-- Widen the curator difficulty label from three values to five:
--   Very easy · Easy · Medium · Hard · Very hard   (seeds −2 … +2)
-- See bank-consumption-cat.html §5.1 / §5.2.
--
-- Two reasons (settled with Sam 2026-07-26): (1) the student-facing band is
-- now DERIVED from the numeric difficulty_irt (§5.5), and five bands spread
-- the "% an average candidate gets right" far more evenly than three; (2)
-- seeding the extremes at ±2 widens the day-one CAT ladder to ±2 with no
-- student data required (the §7.7 "exam can't track a strong candidate" fix).
--
-- This migration widens the CHECK only. It does NOT backfill: existing rows
-- keep their Easy/Medium/Hard labels and their −1/0/+1 seeds untouched
-- (Easy = −1.0 is still a valid point on the five-seed scale). The two new
-- extreme seeds appear only as curators author or re-label items — the
-- app-layer save path writes difficulty_irt from the label going forward
-- (§5.2, lib/bank/difficulty.ts).
--
-- The difficulty_irt / difficulty_source columns already exist (CAT Slice 1,
-- 20260808120000). This migration is purely the label-domain widening.

-- ── nclex_bank_items ─────────────────────────────────────────────────
ALTER TABLE nclex_bank_items
  DROP CONSTRAINT nclex_bank_items_difficulty_check;

ALTER TABLE nclex_bank_items
  ADD CONSTRAINT nclex_bank_items_difficulty_check
  CHECK (difficulty IN ('Very easy', 'Easy', 'Medium', 'Hard', 'Very hard'));

-- ── nclex_tutor_questions (schema parity, §12.7.2) ───────────────────
ALTER TABLE nclex_tutor_questions
  DROP CONSTRAINT nclex_tutor_questions_difficulty_check;

ALTER TABLE nclex_tutor_questions
  ADD CONSTRAINT nclex_tutor_questions_difficulty_check
  CHECK (difficulty IN ('Very easy', 'Easy', 'Medium', 'Hard', 'Very hard'));
