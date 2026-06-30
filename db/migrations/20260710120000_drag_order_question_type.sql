-- 20260710120000_drag_order_question_type.sql
--
-- DRAG_ORDER — a new question type split out of DRAG_DROP's "ordered list" mode
-- (the student drags tokens into ranked positions). Sibling of DRAG_CLOZE
-- (20260709120000), which carved out the "sentence slots" mode.
--
-- Phase A (ADDITIVE only): allow the new 'DRAG_ORDER' value on the three
-- question_type CHECK constraints. DRAG_DROP stays fully valid — it is retired
-- only once we run the one-time decouple (data move + code removal), now that
-- both DRAG_CLOZE and DRAG_ORDER exist. NO data migration here.

ALTER TABLE nclex_bank_items
  DROP CONSTRAINT nclex_bank_items_question_type_check;
ALTER TABLE nclex_bank_items
  ADD CONSTRAINT nclex_bank_items_question_type_check
  CHECK (question_type IN
    ('MCQ','TF','SATA','SELECT_N','MATRIX','HIGHLIGHT','CLOZE',
     'DRAG_DROP','DRAG_CLOZE','DRAG_ORDER','BOWTIE'));

ALTER TABLE nclex_tutor_questions
  DROP CONSTRAINT nclex_tutor_questions_question_type_check;
ALTER TABLE nclex_tutor_questions
  ADD CONSTRAINT nclex_tutor_questions_question_type_check
  CHECK (question_type IN
    ('MCQ','TF','SATA','SELECT_N','MATRIX','HIGHLIGHT','CLOZE',
     'DRAG_DROP','DRAG_CLOZE','DRAG_ORDER','BOWTIE'));

ALTER TABLE nclex_attempt_items
  DROP CONSTRAINT nclex_attempt_items_question_type_check;
ALTER TABLE nclex_attempt_items
  ADD CONSTRAINT nclex_attempt_items_question_type_check
  CHECK (question_type IN
    ('MCQ','TF','SATA','SELECT_N','MATRIX','HIGHLIGHT','CLOZE',
     'DRAG_DROP','DRAG_CLOZE','DRAG_ORDER','BOWTIE'));
