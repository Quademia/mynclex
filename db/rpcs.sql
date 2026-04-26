-- =========================================================
-- MyNclex — RPCs (back-port of slice 1.11b / 1.12b / 1.12c)
-- File: db/rpcs.sql
-- Bootstrap order: schema.sql → rls.sql → rpcs.sql
-- =========================================================
-- Single source of truth for every CREATE OR REPLACE FUNCTION
-- that the app calls via supabase.rpc(). Tables + indexes live in
-- schema.sql; RLS helpers + policies live in rls.sql; transactional
-- business RPCs live here.
--
-- Every function below was first introduced in a numbered migration
-- under db/migrations/. Per repo convention, schema changes are
-- back-ported here so a fresh project boots from {schema, rls, rpcs}
-- without replaying historical migrations.
--
-- Compliance notes (intentionally preserved as-is, parity with gamma):
--   • No explicit SECURITY clause — relies on Postgres default
--     (= SECURITY INVOKER). Future RPCs SHOULD spell this out.
--   • nclex_save_case_with_children has no explicit GRANT EXECUTE,
--     relying on the Postgres default of granting to PUBLIC. The
--     other six are explicitly granted to `authenticated`.
-- =========================================================


-- ─────────────────────────────────────────────────────────
-- Slice 1.11b — transactional case-study save
-- Origin: db/migrations/mynclex_case_save_rpc_slice_1_11b.sql
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION nclex_save_case_with_children(
  p_surface    TEXT,           -- 'admin' | 'tutor'
  p_case_id    TEXT,
  p_case_patch JSONB,          -- header fields: title, scenario_summary, classification, flags
  p_slots      JSONB           -- array of 6 slot objects (see migration source for shape)
)
RETURNS JSONB AS $$
DECLARE
  v_is_admin         BOOLEAN := (p_surface = 'admin');
  v_case_published   BOOLEAN;
  v_populated_count  INT := 0;
  v_slot             JSONB;
  v_initial          JSONB;
  v_position         INT;
  v_cjmm             TEXT;
  v_item_id          TEXT;
  v_qtype            TEXT;
  v_prefix           TEXT;
  v_next_num         INT;
  v_tags             TEXT[];
BEGIN
  IF p_surface NOT IN ('admin', 'tutor') THEN
    RAISE EXCEPTION 'Unknown surface: %', p_surface;
  END IF;

  -- 1. Update the case header row
  IF v_is_admin THEN
    UPDATE nclex_case_studies
    SET
      title                    = COALESCE(p_case_patch->>'title', title),
      scenario_summary         = p_case_patch->>'scenario_summary',
      client_needs_category    = p_case_patch->>'client_needs_category',
      client_needs_subcategory = p_case_patch->>'client_needs_subcategory',
      nursing_subject          = p_case_patch->>'nursing_subject',
      body_system              = p_case_patch->>'body_system',
      topic                    = p_case_patch->>'topic',
      subtopic                 = p_case_patch->>'subtopic',
      difficulty               = p_case_patch->>'difficulty',
      tags                     = COALESCE(
                                   (SELECT ARRAY(SELECT jsonb_array_elements_text(p_case_patch->'tags'))),
                                   tags
                                 ),
      is_free_sample           = COALESCE((p_case_patch->>'is_free_sample')::BOOLEAN, is_free_sample),
      is_builder_visible       = COALESCE((p_case_patch->>'is_builder_visible')::BOOLEAN, is_builder_visible),
      is_published             = COALESCE((p_case_patch->>'is_published')::BOOLEAN, is_published),
      updated_at               = NOW()
    WHERE case_id = p_case_id
    RETURNING is_published INTO v_case_published;
  ELSE
    UPDATE nclex_tutor_case_studies
    SET
      title                    = COALESCE(p_case_patch->>'title', title),
      scenario_summary         = p_case_patch->>'scenario_summary',
      client_needs_category    = p_case_patch->>'client_needs_category',
      client_needs_subcategory = p_case_patch->>'client_needs_subcategory',
      nursing_subject          = p_case_patch->>'nursing_subject',
      body_system              = p_case_patch->>'body_system',
      topic                    = p_case_patch->>'topic',
      subtopic                 = p_case_patch->>'subtopic',
      difficulty               = p_case_patch->>'difficulty',
      tags                     = COALESCE(
                                   (SELECT ARRAY(SELECT jsonb_array_elements_text(p_case_patch->'tags'))),
                                   tags
                                 ),
      is_free_sample           = COALESCE((p_case_patch->>'is_free_sample')::BOOLEAN, is_free_sample),
      is_builder_visible       = COALESCE((p_case_patch->>'is_builder_visible')::BOOLEAN, is_builder_visible),
      is_published             = COALESCE((p_case_patch->>'is_published')::BOOLEAN, is_published),
      updated_at               = NOW()
    WHERE case_id = p_case_id
    RETURNING is_published INTO v_case_published;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found: %', p_case_id;
  END IF;

  -- 2. Iterate slots: upsert populated / delete empty
  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots)
  LOOP
    v_position := (v_slot->>'position')::INT;
    v_cjmm     := v_slot->>'cjmm_step';
    v_initial  := v_slot->'initial';

    IF v_initial IS NULL OR jsonb_typeof(v_initial) = 'null' THEN
      IF v_is_admin THEN
        DELETE FROM nclex_case_study_items
        WHERE case_id = p_case_id AND position = v_position;
      ELSE
        DELETE FROM nclex_tutor_case_study_items
        WHERE case_id = p_case_id AND position = v_position;
      END IF;
      CONTINUE;
    END IF;

    v_item_id := NULLIF(v_initial->>'item_id', '');
    v_qtype   := v_initial->>'question_type';

    IF v_item_id IS NULL THEN
      IF v_is_admin THEN
        v_prefix := 'NCLEX_' || v_qtype || '_';
        SELECT COALESCE(MAX((SUBSTRING(item_id FROM LENGTH(v_prefix) + 1))::INT), 0) + 1
        INTO v_next_num
        FROM nclex_bank_items
        WHERE item_id LIKE v_prefix || '%'
          AND SUBSTRING(item_id FROM LENGTH(v_prefix) + 1) ~ '^[0-9]+$';
      ELSE
        v_prefix := 'NCLEX_TUT_' || v_qtype || '_';
        SELECT COALESCE(MAX((SUBSTRING(item_id FROM LENGTH(v_prefix) + 1))::INT), 0) + 1
        INTO v_next_num
        FROM nclex_tutor_questions
        WHERE item_id LIKE v_prefix || '%'
          AND SUBSTRING(item_id FROM LENGTH(v_prefix) + 1) ~ '^[0-9]+$';
      END IF;
      v_item_id := v_prefix || LPAD(v_next_num::TEXT, 5, '0');
    END IF;

    v_tags := COALESCE(
      (SELECT ARRAY(SELECT jsonb_array_elements_text(v_initial->'tags'))),
      '{}'::TEXT[]
    );

    IF v_is_admin THEN
      INSERT INTO nclex_bank_items (
        item_id, question_type, stem, instruction, rationale, rationale_img,
        content, correct,
        client_needs_category, client_needs_subcategory, nursing_subject,
        body_system, topic, subtopic, difficulty, bloom_level, tags,
        is_free_sample, is_builder_visible, is_published,
        marks, shuffle_options, question_ref, batch_id,
        parent_case_id
      ) VALUES (
        v_item_id,
        v_qtype,
        v_initial->>'stem',
        v_initial->>'instruction',
        v_initial->>'rationale',
        v_initial->>'rationale_img',
        v_initial->'content',
        v_initial->'correct',
        v_initial->>'client_needs_category',
        v_initial->>'client_needs_subcategory',
        v_initial->>'nursing_subject',
        v_initial->>'body_system',
        v_initial->>'topic',
        v_initial->>'subtopic',
        v_initial->>'difficulty',
        v_initial->>'bloom_level',
        v_tags,
        COALESCE((v_initial->>'is_free_sample')::BOOLEAN, FALSE),
        TRUE,
        COALESCE(v_case_published, FALSE),
        COALESCE((v_initial->>'marks')::NUMERIC, 1),
        COALESCE((v_initial->>'shuffle_options')::BOOLEAN, TRUE),
        v_initial->>'question_ref',
        v_initial->>'batch_id',
        p_case_id
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
        parent_case_id            = EXCLUDED.parent_case_id,
        updated_at                = NOW();

      INSERT INTO nclex_case_study_items (
        id, case_id, item_id, position, cjmm_step
      ) VALUES (
        p_case_id || '_J' || v_position::TEXT,
        p_case_id,
        v_item_id,
        v_position,
        v_cjmm
      )
      ON CONFLICT (case_id, position) DO UPDATE SET
        item_id   = EXCLUDED.item_id,
        cjmm_step = EXCLUDED.cjmm_step;

    ELSE
      INSERT INTO nclex_tutor_questions (
        item_id, tutor_id, question_type, stem, instruction, rationale, rationale_img,
        content, correct,
        client_needs_category, client_needs_subcategory, nursing_subject,
        body_system, topic, subtopic, difficulty, bloom_level, tags,
        is_free_sample, is_builder_visible, is_published,
        marks, shuffle_options, question_ref, batch_id,
        parent_case_id
      ) VALUES (
        v_item_id,
        auth.uid(),
        v_qtype,
        v_initial->>'stem',
        v_initial->>'instruction',
        v_initial->>'rationale',
        v_initial->>'rationale_img',
        v_initial->'content',
        v_initial->'correct',
        v_initial->>'client_needs_category',
        v_initial->>'client_needs_subcategory',
        v_initial->>'nursing_subject',
        v_initial->>'body_system',
        v_initial->>'topic',
        v_initial->>'subtopic',
        v_initial->>'difficulty',
        v_initial->>'bloom_level',
        v_tags,
        COALESCE((v_initial->>'is_free_sample')::BOOLEAN, FALSE),
        TRUE,
        COALESCE(v_case_published, FALSE),
        COALESCE((v_initial->>'marks')::NUMERIC, 1),
        COALESCE((v_initial->>'shuffle_options')::BOOLEAN, TRUE),
        v_initial->>'question_ref',
        v_initial->>'batch_id',
        p_case_id
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
        parent_case_id            = EXCLUDED.parent_case_id,
        updated_at                = NOW();

      INSERT INTO nclex_tutor_case_study_items (
        id, case_id, item_id, position, cjmm_step
      ) VALUES (
        p_case_id || '_J' || v_position::TEXT,
        p_case_id,
        v_item_id,
        v_position,
        v_cjmm
      )
      ON CONFLICT (case_id, position) DO UPDATE SET
        item_id   = EXCLUDED.item_id,
        cjmm_step = EXCLUDED.cjmm_step;
    END IF;

    v_populated_count := v_populated_count + 1;
  END LOOP;

  -- 3. Validate publish gate
  IF COALESCE(v_case_published, FALSE) AND v_populated_count < 6 THEN
    RAISE EXCEPTION 'Case cannot be published with only % of 6 slots authored.',
      v_populated_count;
  END IF;

  RETURN jsonb_build_object(
    'ok',                TRUE,
    'case_id',           p_case_id,
    'slots_saved',       v_populated_count
  );
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────────────────────
-- Slice 1.12b — transactional trend save (admin)
-- Origin: db/migrations/mynclex_trend_save_rpc_slice_1_12b.sql
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

GRANT EXECUTE ON FUNCTION nclex_save_trend_with_children(JSONB) TO authenticated;


-- ─────────────────────────────────────────────────────────
-- Slice 1.12b — transactional trend save (tutor)
-- Origin: db/migrations/mynclex_trend_save_rpc_slice_1_12b.sql
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


-- ─────────────────────────────────────────────────────────
-- Slice 1.12c — trend delete RPCs (admin: detach + delete)
-- Origin: db/migrations/mynclex_trend_delete_rpcs_slice_1_12c.sql
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION nclex_detach_and_delete_trend(
  p_trend_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_detached_count INT := 0;
BEGIN
  IF p_trend_id IS NULL OR p_trend_id = '' THEN
    RAISE EXCEPTION 'p_trend_id is required';
  END IF;

  UPDATE nclex_bank_items
     SET trend_id = NULL, updated_at = NOW()
   WHERE trend_id = p_trend_id;
  GET DIAGNOSTICS v_detached_count = ROW_COUNT;

  DELETE FROM nclex_trend_datasets WHERE trend_id = p_trend_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trend dataset not found: %', p_trend_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',               TRUE,
    'detached_count',   v_detached_count,
    'deleted_trend_id', p_trend_id
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION nclex_detach_and_delete_trend(TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────
-- Slice 1.12c — trend delete RPCs (admin: delete everything)
-- Origin: db/migrations/mynclex_trend_delete_rpcs_slice_1_12c.sql
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION nclex_delete_trend_and_children(
  p_trend_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_deleted_item_count INT := 0;
BEGIN
  IF p_trend_id IS NULL OR p_trend_id = '' THEN
    RAISE EXCEPTION 'p_trend_id is required';
  END IF;

  DELETE FROM nclex_bank_items WHERE trend_id = p_trend_id;
  GET DIAGNOSTICS v_deleted_item_count = ROW_COUNT;

  DELETE FROM nclex_trend_datasets WHERE trend_id = p_trend_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trend dataset not found: %', p_trend_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',                  TRUE,
    'deleted_item_count',  v_deleted_item_count,
    'deleted_trend_id',    p_trend_id
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION nclex_delete_trend_and_children(TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────
-- Slice 1.12c — trend delete RPCs (tutor: detach + delete)
-- Origin: db/migrations/mynclex_trend_delete_rpcs_slice_1_12c.sql
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION nclex_tutor_detach_and_delete_trend(
  p_trend_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_detached_count INT := 0;
BEGIN
  IF p_trend_id IS NULL OR p_trend_id = '' THEN
    RAISE EXCEPTION 'p_trend_id is required';
  END IF;

  UPDATE nclex_tutor_questions
     SET trend_id = NULL, updated_at = NOW()
   WHERE trend_id = p_trend_id;
  GET DIAGNOSTICS v_detached_count = ROW_COUNT;

  DELETE FROM nclex_tutor_trend_datasets WHERE trend_id = p_trend_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tutor trend dataset not found: %', p_trend_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',               TRUE,
    'detached_count',   v_detached_count,
    'deleted_trend_id', p_trend_id
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION nclex_tutor_detach_and_delete_trend(TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────
-- Slice 1.12c — trend delete RPCs (tutor: delete everything)
-- Origin: db/migrations/mynclex_trend_delete_rpcs_slice_1_12c.sql
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION nclex_tutor_delete_trend_and_children(
  p_trend_id TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_deleted_item_count INT := 0;
BEGIN
  IF p_trend_id IS NULL OR p_trend_id = '' THEN
    RAISE EXCEPTION 'p_trend_id is required';
  END IF;

  DELETE FROM nclex_tutor_questions WHERE trend_id = p_trend_id;
  GET DIAGNOSTICS v_deleted_item_count = ROW_COUNT;

  DELETE FROM nclex_tutor_trend_datasets WHERE trend_id = p_trend_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tutor trend dataset not found: %', p_trend_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',                  TRUE,
    'deleted_item_count',  v_deleted_item_count,
    'deleted_trend_id',    p_trend_id
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION nclex_tutor_delete_trend_and_children(TEXT) TO authenticated;
