-- ─────────────────────────────────────────────────────────────────────
-- The difficulty seed becomes a database fact, and the CAT pool's
-- membership test finally names the column the engine reads
-- ─────────────────────────────────────────────────────────────────────
-- Two numbers describe a question's difficulty: the curator's LABEL
-- (`difficulty`, a word) and the numeric VALUE (`difficulty_irt`, on the
-- Rasch scale). The engine reads only the number — both CAT picks require
-- `difficulty_irt IS NOT NULL` — while every membership test we built
-- around the pool screens on the LABEL.
--
-- That gap was invisible while the two were always written together. They
-- were, as long as questions came through the editor: the save path calls
-- `seedIrtForLabel()` and writes both. Bulk SQL does not. The 622-item
-- gap-fill run (db/seed/gapfill-20260728/) sets `difficulty` and
-- `difficulty_source` on every row and `difficulty_irt` on none — 13 files,
-- zero mentions of the column.
--
-- The result, measured on dev before this migration:
--
--   • 633 items carry a band and no number.
--   • 622 of them are published standalones with a subcategory — exactly
--     the rows the CAT reserve drawer offers. Reserve any of them and
--     Coverage climbs, the targets look met, and the engine serves none
--     of them. Silent, and it looks like progress.
--   • 11 had already been reserved and were sitting in the pool, counted
--     and unservable.
--
-- The same wrong test appears in FOUR places — the placeability CHECK
-- (20260821120000), the reserve drawer's candidate query, the reserve
-- action's case gate, and the admin page's "unplaceable" audit warning.
-- Tightening all four would still leave the underlying state reachable by
-- the next bulk load. So the fix is the other way round: make the number
-- impossible to omit, and let the tests become belt-and-braces.
--
-- ── Why a trigger rather than a stricter constraint ──────────────────
--
-- A NOT NULL-style constraint would have made the gap-fill load FAIL.
-- That is better than silence, but it is not better than correctness: the
-- number those rows should carry is fully determined by the label they
-- already have. There is nothing to ask a human. A trigger computes it,
-- so every write path — editor, bulk SQL, a migration, an MCP statement,
-- a future importer — lands in the same state without having to remember.
--
-- Same reasoning as the case-study `cat_pool` cascade in 20260822120000:
-- in the database there is no second path.
--
-- ── What this does NOT do ────────────────────────────────────────────
--
-- It does not overwrite an existing number. A row that already has one —
-- including one written by the recalibration job (Slice 10c) with
-- `difficulty_source = 'EMPIRICAL'` — is never touched. The seed fills a
-- hole; it never argues with a measurement.
--
-- No tutor mirror. `nclex_tutor_questions` carries both columns for
-- symmetry, but CAT runs against the admin bank only in v1 and nothing
-- reads them — the same call 20260822120000 made about the cascade.

-- ── 1. backfill the rows that already have the hole ──────────────────
-- The map is the one in lib/bank/difficulty.ts (§5.1): five evenly-spaced
-- points one logit apart, 0 = average ability. An unrecognised label
-- yields NULL rather than a guess, exactly as `seedIrtForLabel()` does —
-- a question with no honest position on the scale must not be given a
-- fake "Medium", because that injects invented evidence into every
-- ability estimate it takes part in.
--
-- Dev before: 633 rows. Of those, 622 are the gap-fill items and 11 were
-- already reserved into the CAT pool.

UPDATE nclex_bank_items
   SET difficulty_irt = CASE difficulty
         WHEN 'Very easy' THEN -2.0
         WHEN 'Easy'      THEN -1.0
         WHEN 'Medium'    THEN  0.0
         WHEN 'Hard'      THEN  1.0
         WHEN 'Very hard' THEN  2.0
       END
 WHERE difficulty     IS NOT NULL
   AND difficulty_irt IS NULL
   AND difficulty IN ('Very easy', 'Easy', 'Medium', 'Hard', 'Very hard');

-- ── 2. the seed becomes automatic ────────────────────────────────────
-- Fires on INSERT and on any UPDATE, not just `UPDATE OF difficulty`: the
-- state we are closing is "number missing", and a bulk statement can
-- create it by writing NULL into the number without going near the label.
-- The WHEN clause keeps it to the rows that actually need it, so this
-- costs nothing on a normal save.

CREATE OR REPLACE FUNCTION nclex_seed_difficulty_irt()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.difficulty_irt := CASE NEW.difficulty
    WHEN 'Very easy' THEN -2.0
    WHEN 'Easy'      THEN -1.0
    WHEN 'Medium'    THEN  0.0
    WHEN 'Hard'      THEN  1.0
    WHEN 'Very hard' THEN  2.0
  END;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION nclex_seed_difficulty_irt() IS
  'Seeds difficulty_irt from the curator''s difficulty label when the row '
  'has a label and no number. Never overwrites an existing value, so a '
  'measured (EMPIRICAL) difficulty is safe. Mirrors seedIrtForLabel() in '
  'lib/bank/difficulty.ts — the CAT engine selects on the number, so a row '
  'with a band and no number is unservable and must not be reachable.';

DROP TRIGGER IF EXISTS nclex_item_seed_difficulty_irt_trg ON nclex_bank_items;
CREATE TRIGGER nclex_item_seed_difficulty_irt_trg
BEFORE INSERT OR UPDATE ON nclex_bank_items
FOR EACH ROW
WHEN (NEW.difficulty IS NOT NULL AND NEW.difficulty_irt IS NULL)
EXECUTE FUNCTION nclex_seed_difficulty_irt();

-- ── 3. the placeability CHECK names the column the engine reads ──────
-- Unchanged in shape from 20260822120000 — case children stay exempt,
-- because their flag is derived from the wrapper and re-asserted on every
-- save, so a binding check would lock a curator out of fixing the very
-- thing it complains about. What changes is that "placeable" now means
-- what selection means.
--
-- With the trigger above, a row with a band always has a number, so this
-- can only fire on a row whose band is itself missing or unrecognised.
-- That is the point: it is now a backstop, not the guard.

ALTER TABLE nclex_bank_items
  DROP CONSTRAINT nclex_bank_items_cat_pool_placeable_check;

ALTER TABLE nclex_bank_items
  ADD CONSTRAINT nclex_bank_items_cat_pool_placeable_check
  CHECK (
    NOT cat_pool
    OR parent_case_id IS NOT NULL
    OR (difficulty     IS NOT NULL
        AND difficulty_irt IS NOT NULL
        AND client_needs_subcategory IS NOT NULL)
  );

-- ── 4. CAT honours a trend dataset's publish state, as practice does ─
-- Separate finding, same session. `_nclex_eligible_unit_pool` refuses a
-- trend question whose dataset is unpublished:
--
--     AND (bi.trend_id IS NULL OR (td.trend_id IS NOT NULL AND td.is_published = TRUE))
--
-- Neither CAT pick did. So a published trend question under an
-- unpublished dataset was hidden from practice and servable in an exam —
-- the surface where being wrong costs most. The dataset holds the
-- scenario and the tabs the question is unanswerable without, and
-- "unpublished" is a curator saying that material is not ready to be
-- seen.
--
-- Zero rows on dev are in that state today (all 32 reserved trend
-- questions with an unpublished dataset are unpublished themselves, so
-- `is_published` already excludes them). This closes it before it can
-- happen rather than after.
--
-- `create_cat_attempt` needs no change: its first-item pick already
-- requires `bi.trend_id IS NULL`, so a trend question is never the
-- opening item of a sitting.
--
-- The body below is the definition deployed by 20260823120000, with two
-- lines added and nothing else altered — proven by stripping the two
-- inserted lines back out of the redeployed function and checking the
-- result is byte-identical to the definition this migration replaced
-- (md5 c9b8e501ced5189052c21f720cb018ef).

CREATE OR REPLACE FUNCTION public.cat_next_item(p_attempt_id uuid, p_last_answer_payload jsonb, p_score_awarded numeric, p_is_correct boolean, p_theta_after numeric, p_se_after numeric, p_terminate_reason text DEFAULT NULL::text, p_terminate_verdict text DEFAULT NULL::text, p_expected_item_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student UUID := auth.uid();
  v_attempt RECORD; v_current RECORD; v_position INTEGER; v_item RECORD;
  v_relaxed BOOLEAN := FALSE; v_under TEXT; v_case_pos INTEGER[];
  v_case_id TEXT; v_child_pos INTEGER; v_weight NUMERIC := 1.0;
  v_unit_type TEXT := 'QUESTION'; v_unit_id TEXT; v_cjmm TEXT := NULL; v_parent_case TEXT := NULL;
BEGIN
  IF v_student IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO v_attempt FROM nclex_attempts
  WHERE attempt_id = p_attempt_id AND student_id = v_student;
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt not found' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF v_attempt.mode <> 'CAT' THEN RAISE EXCEPTION 'not a CAT attempt: %', p_attempt_id; END IF;
  IF v_attempt.status <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'attempt is already %', v_attempt.status; END IF;

  SELECT * INTO v_current FROM nclex_attempt_items
  WHERE attempt_id = p_attempt_id ORDER BY position DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt has no administered item'; END IF;

  -- Idempotency: the turn already landed, so re-serve the current state
  -- rather than answering the NEW question with the OLD answer.
  IF p_expected_item_id IS NOT NULL AND v_current.attempt_item_id <> p_expected_item_id THEN
    RETURN jsonb_build_object('status','CONTINUE','replayed', TRUE, 'exposure_relaxed', FALSE,
      'next_item_payload', jsonb_build_object(
        'attempt_item_id', v_current.attempt_item_id, 'position', v_current.position,
        'item_id', v_current.item_id, 'question_type', v_current.question_type,
        'difficulty_irt', v_current.cat_item_difficulty,
        'parent_case_id', v_current.parent_case_id, 'case_position', v_current.case_position,
        'cat_weight', v_current.cat_weight));
  END IF;

  INSERT INTO nclex_attempt_answers (
    attempt_id, attempt_item_id, student_id, answer_json,
    submission_status, score_awarded, is_correct, submitted_at
  ) VALUES (
    p_attempt_id, v_current.attempt_item_id, v_student,
    COALESCE(p_last_answer_payload, '{}'::jsonb), 'SUBMITTED', p_score_awarded, p_is_correct, NOW()
  ) ON CONFLICT (attempt_item_id) DO UPDATE
    SET answer_json = EXCLUDED.answer_json, score_awarded = EXCLUDED.score_awarded,
        is_correct = EXCLUDED.is_correct, submitted_at = EXCLUDED.submitted_at,
        submission_status = EXCLUDED.submission_status, updated_at = NOW();

  UPDATE nclex_attempts SET last_activity_at = NOW(), updated_at = NOW() WHERE attempt_id = p_attempt_id;

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

  IF v_current.parent_case_id IS NOT NULL AND v_current.case_position < 6 THEN
    v_case_id := v_current.parent_case_id;
    v_child_pos := v_current.case_position + 1;
    SELECT bi.*, csi.cjmm_step AS csi_step INTO v_item
    FROM nclex_case_study_items csi JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
    WHERE csi.case_id = v_case_id AND csi.position = v_child_pos;
    IF NOT FOUND THEN RAISE EXCEPTION 'case % has no child at position %', v_case_id, v_child_pos; END IF;
    v_weight := 0.5; v_unit_type := 'CASE'; v_unit_id := v_case_id;
    v_parent_case := v_case_id; v_cjmm := v_item.csi_step;

  ELSIF v_position = ANY(v_case_pos) THEN
    WITH last3 AS (
      SELECT attempt_id FROM nclex_attempts
      WHERE student_id = v_student AND mode = 'CAT' AND started_at IS NOT NULL
      ORDER BY started_at DESC LIMIT 3
    ), seen_cases AS (
      SELECT DISTINCT ai.parent_case_id AS case_id FROM nclex_attempt_items ai
      JOIN last3 ON last3.attempt_id = ai.attempt_id WHERE ai.parent_case_id IS NOT NULL
      UNION
      SELECT DISTINCT ai.parent_case_id FROM nclex_attempt_items ai
      WHERE ai.attempt_id = p_attempt_id AND ai.parent_case_id IS NOT NULL
    )
    SELECT cs.case_id INTO v_case_id FROM nclex_case_studies cs
    WHERE cs.is_published IS TRUE
      AND cs.cat_pool IS TRUE
      AND NOT EXISTS (SELECT 1 FROM seen_cases sc WHERE sc.case_id = cs.case_id)
      AND (SELECT COUNT(*) FROM nclex_case_study_items csi
           JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
           WHERE csi.case_id = cs.case_id AND bi.is_published IS TRUE
             AND bi.difficulty_irt IS NOT NULL) = 6
    ORDER BY random() LIMIT 1;

    IF v_case_id IS NOT NULL THEN
      INSERT INTO nclex_attempt_case_snapshots (
        attempt_id, case_id, title_snapshot, scenario_summary_snapshot, tabs_snapshot_json)
      SELECT p_attempt_id, cs.case_id, cs.title, cs.scenario_summary,
             COALESCE((SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.display_order)
                       FROM nclex_case_study_tabs t WHERE t.case_id = cs.case_id), '[]'::jsonb)
      FROM nclex_case_studies cs WHERE cs.case_id = v_case_id
      ON CONFLICT (attempt_id, case_id) DO NOTHING;

      SELECT bi.*, csi.cjmm_step AS csi_step INTO v_item
      FROM nclex_case_study_items csi JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
      WHERE csi.case_id = v_case_id AND csi.position = 1;

      v_weight := 0.5; v_unit_type := 'CASE'; v_unit_id := v_case_id;
      v_parent_case := v_case_id; v_cjmm := v_item.csi_step;
    END IF;
  END IF;

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
    ), used_trends AS (
      SELECT DISTINCT ai.trend_id FROM nclex_attempt_items ai
      WHERE ai.attempt_id = p_attempt_id AND ai.trend_id IS NOT NULL
    ), eligible AS (
      SELECT bi.*, abs(bi.difficulty_irt - p_theta_after) AS dist
      FROM nclex_bank_items bi
      WHERE bi.is_published IS TRUE AND bi.cat_pool IS TRUE
        AND bi.difficulty_irt IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM nclex_case_study_items csi WHERE csi.item_id = bi.item_id)
        AND (bi.trend_id IS NULL OR NOT EXISTS (SELECT 1 FROM used_trends ut WHERE ut.trend_id = bi.trend_id))
        AND (bi.trend_id IS NULL OR EXISTS (SELECT 1 FROM nclex_trend_datasets td WHERE td.trend_id = bi.trend_id AND td.is_published IS TRUE))
        AND NOT EXISTS (SELECT 1 FROM nclex_attempt_items ai
                        WHERE ai.attempt_id = p_attempt_id AND ai.item_id = bi.item_id)
        AND NOT EXISTS (SELECT 1 FROM seen WHERE seen.item_id = bi.item_id)
    )
    SELECT * INTO v_item FROM eligible WHERE dist = (SELECT MIN(dist) FROM eligible)
    ORDER BY (client_needs_category IS DISTINCT FROM v_under), random() LIMIT 1;

    IF NOT FOUND THEN
      v_relaxed := TRUE;
      WITH used_trends AS (
        SELECT DISTINCT ai.trend_id FROM nclex_attempt_items ai
        WHERE ai.attempt_id = p_attempt_id AND ai.trend_id IS NOT NULL
      ), eligible AS (
        SELECT bi.*, abs(bi.difficulty_irt - p_theta_after) AS dist
        FROM nclex_bank_items bi
        WHERE bi.is_published IS TRUE AND bi.cat_pool IS TRUE
          AND bi.difficulty_irt IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM nclex_case_study_items csi WHERE csi.item_id = bi.item_id)
          AND (bi.trend_id IS NULL OR NOT EXISTS (SELECT 1 FROM used_trends ut WHERE ut.trend_id = bi.trend_id))
          AND (bi.trend_id IS NULL OR EXISTS (SELECT 1 FROM nclex_trend_datasets td WHERE td.trend_id = bi.trend_id AND td.is_published IS TRUE))
          AND NOT EXISTS (SELECT 1 FROM nclex_attempt_items ai
                          WHERE ai.attempt_id = p_attempt_id AND ai.item_id = bi.item_id)
      )
      SELECT * INTO v_item FROM eligible WHERE dist = (SELECT MIN(dist) FROM eligible)
      ORDER BY (client_needs_category IS DISTINCT FROM v_under), random() LIMIT 1;
      IF NOT FOUND THEN RAISE EXCEPTION 'CAT pool exhausted at position %', v_position; END IF;
    END IF;

    v_unit_id := v_item.item_id; v_weight := 1.0;

    IF v_item.trend_id IS NOT NULL THEN
      INSERT INTO nclex_attempt_trend_snapshots (
        attempt_id, trend_id, title_snapshot, scenario_snapshot, tabs_snapshot_json)
      SELECT p_attempt_id, td.trend_id, td.title, td.scenario,
             COALESCE((SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.display_order)
                       FROM nclex_trend_tabs t WHERE t.trend_id = td.trend_id), '[]'::jsonb)
      FROM nclex_trend_datasets td WHERE td.trend_id = v_item.trend_id
      ON CONFLICT (attempt_id, trend_id) DO NOTHING;
    END IF;
  END IF;

  INSERT INTO nclex_attempt_items (
    attempt_id, position, item_id, item_source, selection_unit_type, selection_unit_id,
    parent_case_id, case_position, cjmm_step, trend_id,
    question_type, stem_snapshot, instruction_snapshot, rationale_snapshot, rationale_img_snapshot,
    marks_snapshot, classification_snapshot, content_snapshot_json, correct_answer_snapshot_json,
    option_order_json, cat_theta_before, cat_se_before,
    cat_item_difficulty, cat_item_difficulty_source, cat_weight
  ) VALUES (
    p_attempt_id, v_position, v_item.item_id, 'BANK', v_unit_type, v_unit_id,
    v_parent_case, CASE WHEN v_parent_case IS NOT NULL THEN COALESCE(v_child_pos, 1) END,
    v_cjmm, v_item.trend_id,
    v_item.question_type, v_item.stem, v_item.instruction, v_item.rationale, v_item.rationale_img,
    COALESCE(v_item.marks, 1),
    jsonb_build_object('client_needs_category', v_item.client_needs_category,
      'client_needs_subcategory', v_item.client_needs_subcategory,
      'nursing_subject', v_item.nursing_subject, 'body_system', v_item.body_system,
      'topic', v_item.topic, 'subtopic', v_item.subtopic,
      'difficulty', v_item.difficulty, 'tags', to_jsonb(v_item.tags)),
    COALESCE(v_item.content, '{}'::jsonb), COALESCE(v_item.correct, '{}'::jsonb), '{}'::jsonb,
    p_theta_after, p_se_after, v_item.difficulty_irt, v_item.difficulty_source, v_weight
  );

  UPDATE nclex_attempts
  SET actual_question_count = v_position,
      actual_unit_count = (SELECT COUNT(DISTINCT COALESCE(parent_case_id, item_id))
                           FROM nclex_attempt_items WHERE attempt_id = p_attempt_id),
      updated_at = NOW()
  WHERE attempt_id = p_attempt_id;

  RETURN jsonb_build_object('status','CONTINUE','replayed', FALSE,'exposure_relaxed', v_relaxed,
    'next_item_payload', jsonb_build_object(
      'attempt_item_id', (SELECT attempt_item_id FROM nclex_attempt_items
                          WHERE attempt_id = p_attempt_id AND position = v_position),
      'position', v_position, 'item_id', v_item.item_id,
      'question_type', v_item.question_type, 'difficulty_irt', v_item.difficulty_irt,
      'parent_case_id', v_parent_case,
      'case_position', CASE WHEN v_parent_case IS NOT NULL THEN COALESCE(v_child_pos, 1) END,
      'cat_weight', v_weight));
END;
$function$;
