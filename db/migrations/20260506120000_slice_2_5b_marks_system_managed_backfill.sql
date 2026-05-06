-- Slice 2.5b — backfill marks via the per-type max formula.
--
-- Marks become system-managed: the editor recomputes them from the
-- answer key at save time (lib/bank/actions/save-question.ts calls
-- lib/scoring/computeMarksFromKey).  Existing rows have whatever
-- curators typed previously — mostly the column default 1 even where
-- partial-credit types should have a higher max.  This one-shot UPDATE
-- corrects them.
--
-- Future rows are correct-by-construction via the editor save handler.
-- See docs/product-plan/bank-marks-and-scoring.html §5.2 (per-type max
-- formula) and §10 (manual backfill is fine).
--
-- Idempotent: re-running produces the same marks values for unchanged
-- rows.

UPDATE nclex_bank_items
SET marks = CASE question_type
  WHEN 'MCQ'       THEN 1
  WHEN 'TF'        THEN 1
  WHEN 'SATA'      THEN jsonb_array_length(correct->'answers')
  WHEN 'SELECT_N'  THEN jsonb_array_length(correct->'answers')
  WHEN 'MATRIX'    THEN (SELECT count(*) FROM jsonb_object_keys(correct->'cells'))
  WHEN 'HIGHLIGHT' THEN jsonb_array_length(correct->'correct_ids')
  WHEN 'CLOZE'     THEN (SELECT count(*) FROM jsonb_object_keys(correct->'answers'))
  WHEN 'DRAG_DROP' THEN (SELECT count(*) FROM jsonb_object_keys(correct->'slots'))
  WHEN 'BOWTIE'    THEN 5
  ELSE marks
END
WHERE correct IS NOT NULL;

UPDATE nclex_tutor_questions
SET marks = CASE question_type
  WHEN 'MCQ'       THEN 1
  WHEN 'TF'        THEN 1
  WHEN 'SATA'      THEN jsonb_array_length(correct->'answers')
  WHEN 'SELECT_N'  THEN jsonb_array_length(correct->'answers')
  WHEN 'MATRIX'    THEN (SELECT count(*) FROM jsonb_object_keys(correct->'cells'))
  WHEN 'HIGHLIGHT' THEN jsonb_array_length(correct->'correct_ids')
  WHEN 'CLOZE'     THEN (SELECT count(*) FROM jsonb_object_keys(correct->'answers'))
  WHEN 'DRAG_DROP' THEN (SELECT count(*) FROM jsonb_object_keys(correct->'slots'))
  WHEN 'BOWTIE'    THEN 5
  ELSE marks
END
WHERE correct IS NOT NULL;
