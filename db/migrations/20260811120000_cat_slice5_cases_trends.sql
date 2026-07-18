-- =========================================================
-- MyNclex — CAT Slice 5: case studies + trends
-- File: mynclex/db/migrations/20260811120000_cat_slice5_cases_trends.sql
-- =========================================================
-- The last engine slice. Teaches cat_next_item to deliver case studies on a
-- schedule and trend-linked questions as ordinary adaptive items.
--
-- Plan: bank-consumption-cat.html §7.4, §15.2, §12.7.12, §19.4 Slice 5.
--
-- THE MATHS IS ALREADY BUILT. @/lib/cat takes a per-response weight and
-- Slice 2 asserts that a 6-child case equals 3 standalone questions exactly.
-- This slice is SCHEDULING AND PLUMBING — it decides when a case appears,
-- serves its children in order, and stamps cat_weight = 0.5 so the maths
-- receives what it expects.
--
-- ── The schedule (§7.4) ──────────────────────────────────────────────
-- Exactly 3 cases per exam, all inside the first 85 (the minimum length, so
-- every student gets all three before the earliest possible finish), never at
-- position 1, and never before ~Q8 — a case is one correlated block, so
-- leading with one gives the engine a weak first fix and a slow start.
--
-- Positions are RANDOMISED WITHIN THREE WINDOWS (Q8-20, Q30-45, Q55-75)
-- rather than fixed. Fixed positions would be learnable: a student sitting
-- several CATs would know a case always lands on Q8. Windows preserve the
-- "spread within the first 85" requirement without the predictability.
--
-- They are DERIVED FROM attempt_id, not stored. Deterministic on the id
-- means the schedule is stable across replays and needs no column — the same
-- trick the embed-player option shuffle uses. Re-deriving mid-exam always
-- yields the same three positions.
--
-- ── Trends (§7.4) ────────────────────────────────────────────────────
-- Trends are NEVER blocks. A trend-linked question is served as an ordinary
-- difficulty-matched item; the extra questions on a dataset are just an
-- interchangeable pool. One item per dataset per exam, so a student never
-- sees the same scenario twice.

-- ── Case schedule, derived from the attempt id ───────────────────────
-- Deterministic: same attempt always yields the same three positions.
CREATE OR REPLACE FUNCTION public.nclex_cat_case_positions(p_attempt_id UUID)
RETURNS INTEGER[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY[
    8  + (('x' || substr(md5(p_attempt_id::text || 'c1'), 1, 8))::bit(32)::bigint % 13),  --  8-20
    30 + (('x' || substr(md5(p_attempt_id::text || 'c2'), 1, 8))::bit(32)::bigint % 16),  -- 30-45
    55 + (('x' || substr(md5(p_attempt_id::text || 'c3'), 1, 8))::bit(32)::bigint % 21)   -- 55-75
  ]::INTEGER[];
$$;


CREATE OR REPLACE FUNCTION public.cat_next_item(
  p_attempt_id          UUID,
  p_last_answer_payload JSONB,
  p_score_awarded       NUMERIC,
  p_is_correct          BOOLEAN,
  p_theta_after         NUMERIC,
  p_se_after            NUMERIC,
  p_terminate_reason    TEXT DEFAULT NULL,
  p_terminate_verdict   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student     UUID := auth.uid();
  v_attempt     RECORD;
  v_current     RECORD;
  v_position    INTEGER;
  v_item        RECORD;
  v_relaxed     BOOLEAN := FALSE;
  v_under       TEXT;
  v_case_pos    INTEGER[];
  v_case_id     TEXT;
  v_child_pos   INTEGER;
  v_weight      NUMERIC := 1.0;
  v_unit_type   TEXT    := 'QUESTION';
  v_unit_id     TEXT;
  v_cjmm        TEXT    := NULL;
  v_parent_case TEXT    := NULL;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_attempt FROM nclex_attempts
  WHERE attempt_id = p_attempt_id AND student_id = v_student;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt not found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_attempt.mode <> 'CAT' THEN
    RAISE EXCEPTION 'not a CAT attempt: %', p_attempt_id;
  END IF;
  IF v_attempt.status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'attempt is already %', v_attempt.status;
  END IF;

  SELECT * INTO v_current FROM nclex_attempt_items
  WHERE attempt_id = p_attempt_id ORDER BY position DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt has no administered item';
  END IF;

  -- ── 1. Record the answer ───────────────────────────────────────────
  INSERT INTO nclex_attempt_answers (
    attempt_id, attempt_item_id, student_id, answer_json,
    submission_status, score_awarded, is_correct, submitted_at
  ) VALUES (
    p_attempt_id, v_current.attempt_item_id, v_student,
    COALESCE(p_last_answer_payload, '{}'::jsonb),
    'SUBMITTED', p_score_awarded, p_is_correct, NOW()
  )
  ON CONFLICT (attempt_item_id) DO UPDATE
    SET answer_json = EXCLUDED.answer_json, score_awarded = EXCLUDED.score_awarded,
        is_correct = EXCLUDED.is_correct, submitted_at = EXCLUDED.submitted_at,
        submission_status = EXCLUDED.submission_status, updated_at = NOW();
        -- answer_changes_json deliberately untouched: it is the
        -- second-guessing log the report reads.

  UPDATE nclex_attempts SET last_activity_at = NOW(), updated_at = NOW()
  WHERE attempt_id = p_attempt_id;

  -- ── 2. Terminate, if TypeScript said so (§9) ───────────────────────
  -- Note a case can never be cut short by CONFIDENCE: that requires >= 85
  -- items and every case sits inside the first 85. Only a timeout can land
  -- mid-block, which is acceptable — the block's answered children have
  -- already contributed their half-weight evidence.
  IF p_terminate_reason IS NOT NULL THEN
    UPDATE nclex_attempts
    SET status = CASE WHEN p_terminate_reason = 'TIME_LIMIT_HIT' THEN 'TIMED_OUT' ELSE 'COMPLETED' END,
        ended_at = NOW(), cat_verdict = p_terminate_verdict,
        cat_final_theta = p_theta_after, cat_final_se = p_se_after,
        cat_termination_reason = p_terminate_reason,
        cat_items_administered = (SELECT COUNT(*) FROM nclex_attempt_items WHERE attempt_id = p_attempt_id),
        updated_at = NOW()
    WHERE attempt_id = p_attempt_id;

    RETURN jsonb_build_object('status','COMPLETE','verdict_payload', jsonb_build_object(
      'verdict', p_terminate_verdict, 'final_theta', p_theta_after, 'final_se', p_se_after,
      'termination_reason', p_terminate_reason,
      'items_administered', (SELECT COUNT(*) FROM nclex_attempt_items WHERE attempt_id = p_attempt_id)));
  END IF;

  v_position := v_current.position + 1;
  v_case_pos := nclex_cat_case_positions(p_attempt_id);

  -- ── 3a. Mid-case? Serve the next child of the SAME case ────────────
  -- The 6 children are fixed and in fixed clinical-judgment order — the
  -- engine estimates over them but does not select among them (§7.4).
  IF v_current.parent_case_id IS NOT NULL AND v_current.case_position < 6 THEN
    v_case_id   := v_current.parent_case_id;
    v_child_pos := v_current.case_position + 1;

    SELECT bi.*, csi.cjmm_step AS csi_step
    INTO v_item
    FROM nclex_case_study_items csi
    JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
    WHERE csi.case_id = v_case_id AND csi.position = v_child_pos;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'case % has no child at position %', v_case_id, v_child_pos;
    END IF;

    v_weight      := 0.5;                 -- §7.4 hybrid — half evidence
    v_unit_type   := 'CASE';
    v_unit_id     := v_case_id;
    v_parent_case := v_case_id;
    v_cjmm        := v_item.csi_step;

  -- ── 3b. Scheduled case position? Start a new case ──────────────────
  ELSIF v_position = ANY(v_case_pos) THEN
    -- Cases are NOT difficulty-matched (§7.4) — picked by schedule, at
    -- random from those the student has not met. Exposure is WRAPPER-level:
    -- a case seen in the last 3 CATs is excluded as a whole.
    WITH last3 AS (
      SELECT attempt_id FROM nclex_attempts
      WHERE student_id = v_student AND mode = 'CAT' AND started_at IS NOT NULL
      ORDER BY started_at DESC LIMIT 3
    ),
    seen_cases AS (
      SELECT DISTINCT ai.parent_case_id AS case_id
      FROM nclex_attempt_items ai JOIN last3 ON last3.attempt_id = ai.attempt_id
      WHERE ai.parent_case_id IS NOT NULL
      UNION
      SELECT DISTINCT ai.parent_case_id
      FROM nclex_attempt_items ai
      WHERE ai.attempt_id = p_attempt_id AND ai.parent_case_id IS NOT NULL
    )
    SELECT cs.case_id INTO v_case_id
    FROM nclex_case_studies cs
    WHERE cs.is_published IS TRUE
      AND NOT EXISTS (SELECT 1 FROM seen_cases sc WHERE sc.case_id = cs.case_id)
      -- All 6 children must exist, be published and carry a difficulty, or
      -- the block would strand mid-way (mirrors the publish-eligibility rule).
      AND (SELECT COUNT(*) FROM nclex_case_study_items csi
           JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
           WHERE csi.case_id = cs.case_id
             AND bi.is_published IS TRUE
             AND bi.difficulty_irt IS NOT NULL) = 6
    ORDER BY random()
    LIMIT 1;

    IF v_case_id IS NOT NULL THEN
      INSERT INTO nclex_attempt_case_snapshots (
        attempt_id, case_id, title_snapshot, scenario_summary_snapshot, tabs_snapshot_json
      )
      SELECT p_attempt_id, cs.case_id, cs.title, cs.scenario_summary,
             COALESCE((SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.display_order)
                       FROM nclex_case_study_tabs t WHERE t.case_id = cs.case_id), '[]'::jsonb)
      FROM nclex_case_studies cs WHERE cs.case_id = v_case_id
      ON CONFLICT (attempt_id, case_id) DO NOTHING;

      SELECT bi.*, csi.cjmm_step AS csi_step
      INTO v_item
      FROM nclex_case_study_items csi
      JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
      WHERE csi.case_id = v_case_id AND csi.position = 1;

      v_weight      := 0.5;
      v_unit_type   := 'CASE';
      v_unit_id     := v_case_id;
      v_parent_case := v_case_id;
      v_cjmm        := v_item.csi_step;
    END IF;
    -- If no case is available the schedule slot silently degrades to a
    -- standalone pick below. A missing case must never stall the exam.
  END IF;

  -- ── 3c. Ordinary adaptive pick (standalone or trend-linked) ────────
  IF v_case_id IS NULL THEN
    SELECT cat INTO v_under FROM (
      SELECT c.cat, COUNT(ai.attempt_item_id) AS n
      FROM (VALUES ('Safe and Effective Care Environment'),('Health Promotion and Maintenance'),
                   ('Psychosocial Integrity'),('Physiological Integrity')) AS c(cat)
      LEFT JOIN nclex_attempt_items ai ON ai.attempt_id = p_attempt_id
        AND ai.classification_snapshot->>'client_needs_category' = c.cat
      GROUP BY c.cat ORDER BY n ASC, c.cat LIMIT 1) least_served;

    WITH last3 AS (
      SELECT attempt_id FROM nclex_attempts
      WHERE student_id = v_student AND mode = 'CAT' AND started_at IS NOT NULL
      ORDER BY started_at DESC LIMIT 3
    ), seen AS (
      SELECT DISTINCT ai.item_id FROM nclex_attempt_items ai
      JOIN last3 ON last3.attempt_id = ai.attempt_id
    ),
    -- One item per trend dataset per exam (§7.4): the extra questions on a
    -- dataset are an interchangeable pool, not a second scenario.
    used_trends AS (
      SELECT DISTINCT ai.trend_id FROM nclex_attempt_items ai
      WHERE ai.attempt_id = p_attempt_id AND ai.trend_id IS NOT NULL
    ),
    eligible AS (
      SELECT bi.*, abs(bi.difficulty_irt - p_theta_after) AS dist
      FROM nclex_bank_items bi
      WHERE bi.is_published IS TRUE AND bi.is_builder_visible IS TRUE
        AND bi.difficulty_irt IS NOT NULL
        -- Case children are only ever served as part of their block.
        AND NOT EXISTS (SELECT 1 FROM nclex_case_study_items csi WHERE csi.item_id = bi.item_id)
        AND (bi.trend_id IS NULL
             OR NOT EXISTS (SELECT 1 FROM used_trends ut WHERE ut.trend_id = bi.trend_id))
        AND NOT EXISTS (SELECT 1 FROM nclex_attempt_items ai
                        WHERE ai.attempt_id = p_attempt_id AND ai.item_id = bi.item_id)
        AND NOT EXISTS (SELECT 1 FROM seen WHERE seen.item_id = bi.item_id)
    )
    SELECT * INTO v_item FROM eligible
    WHERE dist = (SELECT MIN(dist) FROM eligible)
    ORDER BY (client_needs_category IS DISTINCT FROM v_under), random() LIMIT 1;

    -- §7.5 — relax EXPOSURE before difficulty.
    IF NOT FOUND THEN
      v_relaxed := TRUE;
      WITH used_trends AS (
        SELECT DISTINCT ai.trend_id FROM nclex_attempt_items ai
        WHERE ai.attempt_id = p_attempt_id AND ai.trend_id IS NOT NULL
      ), eligible AS (
        SELECT bi.*, abs(bi.difficulty_irt - p_theta_after) AS dist
        FROM nclex_bank_items bi
        WHERE bi.is_published IS TRUE AND bi.is_builder_visible IS TRUE
          AND bi.difficulty_irt IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM nclex_case_study_items csi WHERE csi.item_id = bi.item_id)
          AND (bi.trend_id IS NULL
               OR NOT EXISTS (SELECT 1 FROM used_trends ut WHERE ut.trend_id = bi.trend_id))
          AND NOT EXISTS (SELECT 1 FROM nclex_attempt_items ai
                          WHERE ai.attempt_id = p_attempt_id AND ai.item_id = bi.item_id)
      )
      SELECT * INTO v_item FROM eligible
      WHERE dist = (SELECT MIN(dist) FROM eligible)
      ORDER BY (client_needs_category IS DISTINCT FROM v_under), random() LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'CAT pool exhausted at position %', v_position;
      END IF;
    END IF;

    v_unit_id := v_item.item_id;
    v_weight  := 1.0;

    -- Trend-linked: snapshot the dataset once so the runner can render its
    -- tabs, exactly as every other create path does.
    IF v_item.trend_id IS NOT NULL THEN
      INSERT INTO nclex_attempt_trend_snapshots (
        attempt_id, trend_id, title_snapshot, scenario_snapshot, tabs_snapshot_json
      )
      SELECT p_attempt_id, td.trend_id, td.title, td.scenario,
             COALESCE((SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.display_order)
                       FROM nclex_trend_tabs t WHERE t.trend_id = td.trend_id), '[]'::jsonb)
      FROM nclex_trend_datasets td WHERE td.trend_id = v_item.trend_id
      ON CONFLICT (attempt_id, trend_id) DO NOTHING;
    END IF;
  END IF;

  -- ── 4. Snapshot it ─────────────────────────────────────────────────
  INSERT INTO nclex_attempt_items (
    attempt_id, position, item_id, item_source,
    selection_unit_type, selection_unit_id,
    parent_case_id, case_position, cjmm_step, trend_id,
    question_type, stem_snapshot, instruction_snapshot,
    rationale_snapshot, rationale_img_snapshot,
    marks_snapshot, classification_snapshot,
    content_snapshot_json, correct_answer_snapshot_json, option_order_json,
    cat_theta_before, cat_se_before,
    cat_item_difficulty, cat_item_difficulty_source, cat_weight
  ) VALUES (
    p_attempt_id, v_position, v_item.item_id, 'BANK',
    v_unit_type, v_unit_id,
    v_parent_case,
    CASE WHEN v_parent_case IS NOT NULL THEN COALESCE(v_child_pos, 1) END,
    v_cjmm, v_item.trend_id,
    v_item.question_type, v_item.stem, v_item.instruction,
    v_item.rationale, v_item.rationale_img,
    COALESCE(v_item.marks, 1),
    jsonb_build_object(
      'client_needs_category',    v_item.client_needs_category,
      'client_needs_subcategory', v_item.client_needs_subcategory,
      'nursing_subject',          v_item.nursing_subject,
      'body_system',              v_item.body_system,
      'topic',                    v_item.topic,
      'subtopic',                 v_item.subtopic,
      'difficulty',               v_item.difficulty,
      'tags',                     to_jsonb(v_item.tags)
    ),
    COALESCE(v_item.content, '{}'::jsonb),
    COALESCE(v_item.correct, '{}'::jsonb),
    '{}'::jsonb,
    p_theta_after, p_se_after,
    v_item.difficulty_irt, v_item.difficulty_source, v_weight
  );

  UPDATE nclex_attempts
  SET actual_question_count = v_position,
      -- A case block is ONE unit however many children it has.
      actual_unit_count = (SELECT COUNT(DISTINCT COALESCE(parent_case_id, item_id))
                           FROM nclex_attempt_items WHERE attempt_id = p_attempt_id),
      updated_at = NOW()
  WHERE attempt_id = p_attempt_id;

  RETURN jsonb_build_object(
    'status', 'CONTINUE',
    'exposure_relaxed', v_relaxed,
    'next_item_payload', jsonb_build_object(
      'attempt_item_id', (SELECT attempt_item_id FROM nclex_attempt_items
                          WHERE attempt_id = p_attempt_id AND position = v_position),
      'position',       v_position,
      'item_id',        v_item.item_id,
      'question_type',  v_item.question_type,
      'difficulty_irt', v_item.difficulty_irt,
      'parent_case_id', v_parent_case,
      'case_position',  CASE WHEN v_parent_case IS NOT NULL THEN COALESCE(v_child_pos, 1) END,
      'cat_weight',     v_weight
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cat_next_item(UUID, JSONB, NUMERIC, BOOLEAN, NUMERIC, NUMERIC, TEXT, TEXT)
  TO authenticated;
