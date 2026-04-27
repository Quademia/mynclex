-- =========================================================
-- MyNclex — Slice 1.11b: transactional case save RPC
-- File: mynclex/db/migrations/mynclex_case_save_rpc_slice_1_11b.sql
-- Depends on: mynclex_parent_case_id_slice_1_11b.sql
-- =========================================================
-- Introduces the first multi-row atomic-write pattern in this repo.
-- Before this slice, server actions used sequential Supabase calls
-- which cannot be rolled back atomically if a late step fails. The
-- Case Study editor saves the case header + up to six child questions
-- + six join rows — if the last insert fails midway, we either want
-- nothing written or everything written, never half-applied state.
-- A single PL/pgSQL function called via supabase.rpc() is the
-- recommended pattern for this.
--
-- Function: nclex_save_case_with_children
--
-- Caller responsibilities (TypeScript side in case-study/actions.ts):
--   * Auth check (BANK_CURATE / SUPER_ADMIN for admin, TUTOR for tutor).
--   * Parse FormData + slot JSON → build jsonb payload.
--   * Validate structure — the RPC trusts the caller on shape.
--
-- RPC responsibilities:
--   * Update the case header row.
--   * For each populated slot: upsert the bank_items row (admin) or
--     tutor_questions row (tutor), setting parent_case_id = case_id
--     and is_builder_visible = TRUE. is_published follows the case's
--     own is_published flag (post-update).
--   * For each populated slot: upsert the join row.
--   * For each empty slot: delete any stale join row for that position
--     (leaves the underlying bank item — orphaned items are recoverable
--     content, not debris).
--   * Generate item_ids for slots whose caller passed item_id = null.
--   * Validate: if the case is published after the update, all six
--     slots must be populated with valid rows; otherwise raise and
--     roll back.
--
-- Every statement runs inside a single implicit transaction (plpgsql
-- functions are transaction-atomic). RAISE EXCEPTION rolls the whole
-- thing back.
-- =========================================================

CREATE OR REPLACE FUNCTION nclex_save_case_with_children(
  p_surface    TEXT,           -- 'admin' | 'tutor'
  p_case_id    TEXT,
  p_case_patch JSONB,          -- header fields: title, scenario_summary, classification, flags
  p_slots      JSONB           -- array of 6 slot objects (see shape below)
)
RETURNS JSONB AS $$
DECLARE
  -- Slot object shape (per element in p_slots):
  --   { position: 1..6,
  --     cjmm_step: TEXT | null,
  --     initial: jsonb | null }  -- null = empty slot
  -- When initial is non-null, it has the following jsonb shape:
  --   { item_id: TEXT | null,    -- null → RPC generates
  --     question_type: TEXT,
  --     stem, instruction, rationale, rationale_img,
  --     content (jsonb), correct (jsonb),
  --     client_needs_category, client_needs_subcategory,
  --     nursing_subject, body_system, topic, subtopic,
  --     difficulty, bloom_level, tags (jsonb array of text),
  --     is_free_sample (bool), marks (number), shuffle_options (bool),
  --     question_ref, batch_id }

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

  -- ── 1. Update the case header row ────────────────────────────
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

  -- ── 2. Iterate slots: upsert populated / delete empty ────────
  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots)
  LOOP
    v_position := (v_slot->>'position')::INT;
    v_cjmm     := v_slot->>'cjmm_step';
    v_initial  := v_slot->'initial';

    -- Empty slot: delete any stale join row at this position and
    -- move on. Leave the underlying bank_item (ON DELETE SET NULL on
    -- parent_case_id means an orphaned item remains editable later).
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

    -- Populated slot. Generate an item_id if the caller didn't
    -- supply one.
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

    -- Tags jsonb → text[]
    v_tags := COALESCE(
      (SELECT ARRAY(SELECT jsonb_array_elements_text(v_initial->'tags'))),
      '{}'::TEXT[]
    );

    -- Upsert the question row. parent_case_id and is_builder_visible
    -- are server-controlled for case-linked items; is_published
    -- follows the parent case.
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
        -- question_type intentionally NOT updated (locked post-create).
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

      -- Upsert the join row. Join ID is deterministic so reorders /
      -- re-saves stay stable.
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
      -- Tutor surface: tutor_id = auth.uid() on insert. RLS enforces
      -- that only rows where tutor_id = auth.uid() are visible /
      -- writeable, so a cross-tutor hijack attempt hits the policy
      -- wall before reaching the column.
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

  -- ── 3. Validate publish gate ─────────────────────────────────
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
