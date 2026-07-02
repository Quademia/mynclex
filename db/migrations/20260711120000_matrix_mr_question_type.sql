-- 20260711120000_matrix_mr_question_type.sql
--
-- MATRIX_MR — Matrix Multiple Response. A new self-contained question type
-- (own editor / parser / runner / scoring), mirrored from MATRIX. Where
-- MATRIX allows exactly one correct column per row (radio), MATRIX_MR allows
-- one OR MORE correct columns per row (checkbox), scored SATA-style per row.
-- Existing MATRIX is untouched.
--
-- ADDITIVE only: allow the new 'MATRIX_MR' value on the three question_type
-- CHECK constraints. NO data migration.

ALTER TABLE nclex_bank_items
  DROP CONSTRAINT nclex_bank_items_question_type_check;
ALTER TABLE nclex_bank_items
  ADD CONSTRAINT nclex_bank_items_question_type_check
  CHECK (question_type IN
    ('MCQ','TF','SATA','SELECT_N','MATRIX','MATRIX_MR','HIGHLIGHT','CLOZE',
     'DRAG_DROP','DRAG_CLOZE','DRAG_ORDER','BOWTIE'));

ALTER TABLE nclex_tutor_questions
  DROP CONSTRAINT nclex_tutor_questions_question_type_check;
ALTER TABLE nclex_tutor_questions
  ADD CONSTRAINT nclex_tutor_questions_question_type_check
  CHECK (question_type IN
    ('MCQ','TF','SATA','SELECT_N','MATRIX','MATRIX_MR','HIGHLIGHT','CLOZE',
     'DRAG_DROP','DRAG_CLOZE','DRAG_ORDER','BOWTIE'));

ALTER TABLE nclex_attempt_items
  DROP CONSTRAINT nclex_attempt_items_question_type_check;
ALTER TABLE nclex_attempt_items
  ADD CONSTRAINT nclex_attempt_items_question_type_check
  CHECK (question_type IN
    ('MCQ','TF','SATA','SELECT_N','MATRIX','MATRIX_MR','HIGHLIGHT','CLOZE',
     'DRAG_DROP','DRAG_CLOZE','DRAG_ORDER','BOWTIE'));
