-- 20260709120000_drag_cloze_question_type.sql
--
-- DRAG_CLOZE — a new question type split out of DRAG_DROP's "sentence slots"
-- mode (the stem carries [N] markers; the student drags tokens into the blanks).
--
-- Phase A (ADDITIVE only): allow the new 'DRAG_CLOZE' value on the three
-- question_type CHECK constraints. DRAG_DROP stays fully valid — it is retired
-- only once DRAG_ORDER also lands and we run the one-time decouple (data move +
-- code removal). There is NO data migration here: existing DRAG_DROP rows are
-- untouched.

ALTER TABLE nclex_bank_items
  DROP CONSTRAINT nclex_bank_items_question_type_check;
ALTER TABLE nclex_bank_items
  ADD CONSTRAINT nclex_bank_items_question_type_check
  CHECK (question_type IN
    ('MCQ','TF','SATA','SELECT_N','MATRIX','HIGHLIGHT','CLOZE',
     'DRAG_DROP','DRAG_CLOZE','BOWTIE'));

ALTER TABLE nclex_tutor_questions
  DROP CONSTRAINT nclex_tutor_questions_question_type_check;
ALTER TABLE nclex_tutor_questions
  ADD CONSTRAINT nclex_tutor_questions_question_type_check
  CHECK (question_type IN
    ('MCQ','TF','SATA','SELECT_N','MATRIX','HIGHLIGHT','CLOZE',
     'DRAG_DROP','DRAG_CLOZE','BOWTIE'));

ALTER TABLE nclex_attempt_items
  DROP CONSTRAINT nclex_attempt_items_question_type_check;
ALTER TABLE nclex_attempt_items
  ADD CONSTRAINT nclex_attempt_items_question_type_check
  CHECK (question_type IN
    ('MCQ','TF','SATA','SELECT_N','MATRIX','HIGHLIGHT','CLOZE',
     'DRAG_DROP','DRAG_CLOZE','BOWTIE'));
