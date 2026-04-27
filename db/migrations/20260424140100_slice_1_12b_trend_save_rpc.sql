-- =========================================================
-- MyNclex — Slice 1.12b: transactional trend save RPC
-- File: mynclex/db/migrations/mynclex_trend_save_rpc_slice_1_12b.sql
-- Depends on: mynclex_trend_id_column_slice_1_12b.sql
-- =========================================================
-- Two parallel functions, one per surface (admin + tutor). Each takes
-- a JSONB payload shaped as:
--
--   { "trend":        { trend_id, title, scenario, kind,
--                       timepoints (jsonb array),
--                       rows (jsonb array),
--                       is_published (bool) },
--     "questions":    [ { item_id | null,
--                         question_type | null,
--                         stem, instruction, rationale, rationale_img,
--                         content (jsonb), correct (jsonb),
--                         client_needs_category, client_needs_subcategory,
--                         nursing_subject, body_system, topic, subtopic,
--                         difficulty, bloom_level, tags (jsonb array),
--                         is_published, is_free_sample, is_builder_visible,
--                         marks, shuffle_options, question_ref, batch_id }, ... ],
--     "deleted_item_ids": [ "...", ... ] }
--
-- Responsibilities:
--   1. UPDATE the dataset row.
--   2. For each question: INSERT or UPDATE, setting trend_id to match
--      the payload dataset. Skip empty slots (no question_type AND
--      empty stem).
--   3. Delete any item_id listed in deleted_item_ids, scoped to this
--      trend — cross-dataset delete is a caller bug and raises.
--   4. If dataset.is_published is TRUE, validate every persisted
--      question has a valid question_type + non-empty stem. Per-type
--      content shape validation stays in the TS layer; the RPC only
--      gates the "shape basics" the curator can tell from the UI.
--   5. Return { ok: true, trend_id, saved_item_ids, deleted_item_ids }.
--
-- Differences from nclex_save_case_with_children (intentional):
--   • No parent_case_id handling. trend_id is the only link field.
--   • No is_builder_visible = TRUE forcing. Curator sets it per item.
--   • No is_published inheritance. Per-question is_published is
--     independent of dataset.is_published. (See plan doc decision 3 +
--     the 1.12b handoff's state matrix.)
--   • No CJMM step — not applicable.
--   • No fixed slot count — variable-N via array iteration.
--
-- NOTE — two parallel functions, not one branched-on-surface.
-- The handoff specifies two separate entry points so the calling code
-- (lib/bank/trend/actions.ts) picks one by surface up front and
-- passes a single payload. Case Study's RPC took surface as an arg
-- and branched internally; Trend follows the handoff's explicit
-- two-function shape.

-- ─────────────────────────────────────────────────────────
-- Admin: nclex_save_trend_with_children
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION nclex_save_trend_with_children(
  payload JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_trend              JSONB := payload->'trend';
  v_trend_id           TEXT;
  v_dataset_published  BOOLEAN;
  v_question           JSONB;
  v_item_id            TEXT;
  v_qtype              TEXT;
  v_stem               TEXT;
  v_prefix             TEXT;
  v_next_num           INT;
  v_tags               TEXT[];
  v_saved_ids          TEXT[] := '{}';
  v_deleted_ids        TEXT[] := '{}';
  v_del_id             TEXT;
BEGIN
  v_trend_id := v_trend->>'trend_id';
  IF v_trend_id IS NULL OR v_trend_id = '' THEN
    RAISE EXCEPTION 'payload.trend.trend_id is required';
  END IF;

  -- 1. Update dataset row
  UPDATE nclex_trend_datasets
  SET
    title        = COALESCE(v_trend->>'title', title),
    scenario     = v_trend->>'scenario',
    kind         = COALESCE(v_trend->>'kind', kind),
    timepoints   = COALESCE(v_trend->'timepoints', timepoints),
    rows         = COALESCE(v_trend->'rows',       rows),
    is_published = COALESCE((v_trend->>'is_published')::BOOLEAN, is_published),
    updated_at   = NOW()
  WHERE trend_id = v_trend_id
  RETURNING is_published INTO v_dataset_published;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trend dataset not found: %', v_trend_id;
  END IF;

  -- 2. Iterate questions
  FOR v_question IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'questions', '[]'::JSONB))
  LOOP
    v_item_id := NULLIF(v_question->>'item_id', '');
    v_qtype   := NULLIF(v_question->>'question_type', '');
    v_stem    := COALESCE(v_question->>'stem', '');

    -- Empty slot: no type AND empty stem → drop.
    IF v_qtype IS NULL AND LENGTH(TRIM(v_stem)) = 0 THEN
      CONTINUE;
    END IF;

    -- If no item_id, mint one based on question_type. Matches
    -- Case Study's minting shape: NCLEX_{TYPE}_NNNNN (5-wide).
    IF v_item_id IS NULL THEN
      IF v_qtype IS NULL THEN
        RAISE EXCEPTION 'Cannot mint item_id for question with no question_type';
      END IF;
      v_prefix := 'NCLEX_' || v_qtype || '_';
      SELECT COALESCE(MAX((SUBSTRING(item_id FROM LENGTH(v_prefix) + 1))::INT), 0) + 1
      INTO v_next_num
      FROM nclex_bank_items
      WHERE item_id LIKE v_prefix || '%'
        AND SUBSTRING(item_id FROM LENGTH(v_prefix) + 1) ~ '^[0-9]+$';
      v_item_id := v_prefix || LPAD(v_next_num::TEXT, 5, '0');
    END IF;

    v_tags := COALESCE(
      (SELECT ARRAY(SELECT jsonb_array_elements_text(v_question->'tags'))),
      '{}'::TEXT[]
    );

    -- Upsert. question_type stays pinned on UPDATE (locked post-create,
    -- mirrors standalone-bank behaviour). trend_id pinned to the
    -- payload dataset defensively on both paths.
    INSERT INTO nclex_bank_items (
      item_id, question_type, stem, instruction, rationale, rationale_img,
      content, correct,
      client_needs_category, client_needs_subcategory, nursing_subject,
      body_system, topic, subtopic, difficulty, bloom_level, tags,
      is_free_sample, is_builder_visible, is_published,
      marks, shuffle_options, question_ref, batch_id,
      trend_id
    ) VALUES (
      v_item_id,
      v_qtype,
      v_stem,
      v_question->>'instruction',
      v_question->>'rationale',
      v_question->>'rationale_img',
      COALESCE(v_question->'content', '{}'::JSONB),
      COALESCE(v_question->'correct', '{}'::JSONB),
      v_question->>'client_needs_category',
      v_question->>'client_needs_subcategory',
      v_question->>'nursing_subject',
      v_question->>'body_system',
      v_question->>'topic',
      v_question->>'subtopic',
      v_question->>'difficulty',
      v_question->>'bloom_level',
      v_tags,
      COALESCE((v_question->>'is_free_sample')::BOOLEAN, FALSE),
      COALESCE((v_question->>'is_builder_visible')::BOOLEAN, TRUE),
      COALESCE((v_question->>'is_published')::BOOLEAN, FALSE),
      COALESCE((v_question->>'marks')::NUMERIC, 1),
      COALESCE((v_question->>'shuffle_options')::BOOLEAN, TRUE),
      v_question->>'question_ref',
      v_question->>'batch_id',
      v_trend_id
    )
    ON CONFLICT (item_id) DO UPDATE SET
      stem                      = EXCLUDED.stem,
      instruction               = EXCLUDED.instruction,
      rationale                 = EXCLUDED.rationale,
      rationale_img             = EXCLUDED.rationale_img,
      content                   = EXCLUDED.content,
      correct                   = EXCLUDED.correct,
      client_needs_category     = EXCLUDED.client_needs_category,
      client_needs_subcategory  = EXCLUDED.client_needs_subcategory,
      nursing_subject           = EXCLUDED.nursing_subject,
      body_system               = EXCLUDED.body_system,
      topic                     = EXCLUDED.topic,
      subtopic                  = EXCLUDED.subtopic,
      difficulty                = EXCLUDED.difficulty,
      bloom_level               = EXCLUDED.bloom_level,
      tags                      = EXCLUDED.tags,
      is_free_sample            = EXCLUDED.is_free_sample,
      is_builder_visible        = EXCLUDED.is_builder_visible,
      is_published              = EXCLUDED.is_published,
      marks                     = EXCLUDED.marks,
      shuffle_options           = EXCLUDED.shuffle_options,
      question_ref              = EXCLUDED.question_ref,
      batch_id                  = EXCLUDED.batch_id,
      trend_id                  = EXCLUDED.trend_id,
      updated_at                = NOW();

    v_saved_ids := array_append(v_saved_ids, v_item_id);
  END LOOP;

  -- 3. Deletions — scoped to this dataset.
  FOREACH v_del_id IN ARRAY COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(payload->'deleted_item_ids'))),
    '{}'::TEXT[]
  )
  LOOP
    DELETE FROM nclex_bank_items
    WHERE item_id = v_del_id
      AND trend_id = v_trend_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'deleted_item_id % not found on trend %', v_del_id, v_trend_id;
    END IF;
    v_deleted_ids := array_append(v_deleted_ids, v_del_id);
  END LOOP;

  -- 4. Validate publish gate (only when dataset is published).
  IF COALESCE(v_dataset_published, FALSE) THEN
    FOR v_question IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'questions', '[]'::JSONB))
    LOOP
      v_qtype := NULLIF(v_question->>'question_type', '');
      v_stem  := COALESCE(v_question->>'stem', '');
      -- Skip-filter echoes step 2 so the check matches what's persisted.
      IF v_qtype IS NULL AND LENGTH(TRIM(v_stem)) = 0 THEN
        CONTINUE;
      END IF;
      IF v_qtype IS NULL THEN
        RAISE EXCEPTION 'Published dataset: every attached question needs a question_type';
      END IF;
      IF LENGTH(TRIM(v_stem)) = 0 THEN
        RAISE EXCEPTION 'Published dataset: every attached question needs a stem';
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok',                TRUE,
    'trend_id',          v_trend_id,
    'saved_item_ids',    to_jsonb(v_saved_ids),
    'deleted_item_ids',  to_jsonb(v_deleted_ids)
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION nclex_save_trend_with_children(JSONB) TO authenticated;


-- ─────────────────────────────────────────────────────────
-- Tutor: nclex_tutor_save_trend_with_children
-- Parallel function against the tutor-private tables. Identical
-- body shape with tutor-table names substituted. RLS on
-- nclex_tutor_questions / nclex_tutor_trend_datasets enforces
-- owner-only access at the DB level independently of this
-- function's logic.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION nclex_tutor_save_trend_with_children(
  payload JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_trend              JSONB := payload->'trend';
  v_trend_id           TEXT;
  v_dataset_published  BOOLEAN;
  v_question           JSONB;
  v_item_id            TEXT;
  v_qtype              TEXT;
  v_stem               TEXT;
  v_prefix             TEXT;
  v_next_num           INT;
  v_tags               TEXT[];
  v_saved_ids          TEXT[] := '{}';
  v_deleted_ids        TEXT[] := '{}';
  v_del_id             TEXT;
BEGIN
  v_trend_id := v_trend->>'trend_id';
  IF v_trend_id IS NULL OR v_trend_id = '' THEN
    RAISE EXCEPTION 'payload.trend.trend_id is required';
  END IF;

  UPDATE nclex_tutor_trend_datasets
  SET
    title        = COALESCE(v_trend->>'title', title),
    scenario     = v_trend->>'scenario',
    kind         = COALESCE(v_trend->>'kind', kind),
    timepoints   = COALESCE(v_trend->'timepoints', timepoints),
    rows         = COALESCE(v_trend->'rows',       rows),
    is_published = COALESCE((v_trend->>'is_published')::BOOLEAN, is_published),
    updated_at   = NOW()
  WHERE trend_id = v_trend_id
  RETURNING is_published INTO v_dataset_published;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tutor trend dataset not found: %', v_trend_id;
  END IF;

  FOR v_question IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'questions', '[]'::JSONB))
  LOOP
    v_item_id := NULLIF(v_question->>'item_id', '');
    v_qtype   := NULLIF(v_question->>'question_type', '');
    v_stem    := COALESCE(v_question->>'stem', '');

    IF v_qtype IS NULL AND LENGTH(TRIM(v_stem)) = 0 THEN
      CONTINUE;
    END IF;

    IF v_item_id IS NULL THEN
      IF v_qtype IS NULL THEN
        RAISE EXCEPTION 'Cannot mint item_id for question with no question_type';
      END IF;
      v_prefix := 'NCLEX_TUT_' || v_qtype || '_';
      SELECT COALESCE(MAX((SUBSTRING(item_id FROM LENGTH(v_prefix) + 1))::INT), 0) + 1
      INTO v_next_num
      FROM nclex_tutor_questions
      WHERE item_id LIKE v_prefix || '%'
        AND SUBSTRING(item_id FROM LENGTH(v_prefix) + 1) ~ '^[0-9]+$';
      v_item_id := v_prefix || LPAD(v_next_num::TEXT, 5, '0');
    END IF;

    v_tags := COALESCE(
      (SELECT ARRAY(SELECT jsonb_array_elements_text(v_question->'tags'))),
      '{}'::TEXT[]
    );

    INSERT INTO nclex_tutor_questions (
      item_id, tutor_id, question_type, stem, instruction, rationale, rationale_img,
      content, correct,
      client_needs_category, client_needs_subcategory, nursing_subject,
      body_system, topic, subtopic, difficulty, bloom_level, tags,
      is_free_sample, is_builder_visible, is_published,
      marks, shuffle_options, question_ref, batch_id,
      trend_id
    ) VALUES (
      v_item_id,
      auth.uid(),
      v_qtype,
      v_stem,
      v_question->>'instruction',
      v_question->>'rationale',
      v_question->>'rationale_img',
      COALESCE(v_question->'content', '{}'::JSONB),
      COALESCE(v_question->'correct', '{}'::JSONB),
      v_question->>'client_needs_category',
      v_question->>'client_needs_subcategory',
      v_question->>'nursing_subject',
      v_question->>'body_system',
      v_question->>'topic',
      v_question->>'subtopic',
      v_question->>'difficulty',
      v_question->>'bloom_level',
      v_tags,
      COALESCE((v_question->>'is_free_sample')::BOOLEAN, FALSE),
      COALESCE((v_question->>'is_builder_visible')::BOOLEAN, TRUE),
      COALESCE((v_question->>'is_published')::BOOLEAN, FALSE),
      COALESCE((v_question->>'marks')::NUMERIC, 1),
      COALESCE((v_question->>'shuffle_options')::BOOLEAN, TRUE),
      v_question->>'question_ref',
      v_question->>'batch_id',
      v_trend_id
    )
    ON CONFLICT (item_id) DO UPDATE SET
      stem                      = EXCLUDED.stem,
      instruction               = EXCLUDED.instruction,
      rationale                 = EXCLUDED.rationale,
      rationale_img             = EXCLUDED.rationale_img,
      content                   = EXCLUDED.content,
      correct                   = EXCLUDED.correct,
      client_needs_category     = EXCLUDED.client_needs_category,
      client_needs_subcategory  = EXCLUDED.client_needs_subcategory,
      nursing_subject           = EXCLUDED.nursing_subject,
      body_system               = EXCLUDED.body_system,
      topic                     = EXCLUDED.topic,
      subtopic                  = EXCLUDED.subtopic,
      difficulty                = EXCLUDED.difficulty,
      bloom_level               = EXCLUDED.bloom_level,
      tags                      = EXCLUDED.tags,
      is_free_sample            = EXCLUDED.is_free_sample,
      is_builder_visible        = EXCLUDED.is_builder_visible,
      is_published              = EXCLUDED.is_published,
      marks                     = EXCLUDED.marks,
      shuffle_options           = EXCLUDED.shuffle_options,
      question_ref              = EXCLUDED.question_ref,
      batch_id                  = EXCLUDED.batch_id,
      trend_id                  = EXCLUDED.trend_id,
      updated_at                = NOW();

    v_saved_ids := array_append(v_saved_ids, v_item_id);
  END LOOP;

  FOREACH v_del_id IN ARRAY COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(payload->'deleted_item_ids'))),
    '{}'::TEXT[]
  )
  LOOP
    DELETE FROM nclex_tutor_questions
    WHERE item_id = v_del_id
      AND trend_id = v_trend_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'deleted_item_id % not found on tutor trend %', v_del_id, v_trend_id;
    END IF;
    v_deleted_ids := array_append(v_deleted_ids, v_del_id);
  END LOOP;

  IF COALESCE(v_dataset_published, FALSE) THEN
    FOR v_question IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'questions', '[]'::JSONB))
    LOOP
      v_qtype := NULLIF(v_question->>'question_type', '');
      v_stem  := COALESCE(v_question->>'stem', '');
      IF v_qtype IS NULL AND LENGTH(TRIM(v_stem)) = 0 THEN
        CONTINUE;
      END IF;
      IF v_qtype IS NULL THEN
        RAISE EXCEPTION 'Published dataset: every attached question needs a question_type';
      END IF;
      IF LENGTH(TRIM(v_stem)) = 0 THEN
        RAISE EXCEPTION 'Published dataset: every attached question needs a stem';
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok',                TRUE,
    'trend_id',          v_trend_id,
    'saved_item_ids',    to_jsonb(v_saved_ids),
    'deleted_item_ids',  to_jsonb(v_deleted_ids)
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION nclex_tutor_save_trend_with_children(JSONB) TO authenticated;
