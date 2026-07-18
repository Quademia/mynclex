-- =========================================================
-- MyNclex — CAT Slice 4: cat_next_item (the core loop, standalone-only)
-- File: mynclex/db/migrations/20260810120000_cat_slice4_next_item.sql
-- =========================================================
-- Fills in the second Slice 1 stub. One call = one turn of the exam.
--
-- Plan: bank-consumption-cat.html §19.4 Slice 4, §10.2, §10.6, §7.1, §7.3,
-- §7.5, §8.1, §9, §12.7.12, §15.2.
--
-- §10.6 SPLIT — this function does NOT score and does NOT do Rasch maths.
-- Server-side TypeScript (lib/practice/cat/) loads the response history,
-- scores with lib/scoring, re-estimates with lib/cat, and runs the
-- termination check; it hands the results here. This function PERSISTS and
-- SELECTS. That is why the signature takes a computed score and an already
-- updated theta/SE rather than deriving them: a PL/pgSQL engine could not
-- reuse lib/scoring without reimplementing all five scoring functions plus
-- the 13-type dispatch in SQL, which is the duplication behind the `marks`
-- bug.
--
-- ATOMICITY (§10.3) — every write below happens in this one function, so it
-- is one transaction: either the answer is recorded and the next item
-- snapshotted, or neither. The computation that precedes it is pure and
-- side-effect-free, so a throw there writes nothing.
--
-- SELECTION (§7.1, revised 2026-07-19) — NEAREST-NEIGHBOUR, not a fixed
-- tolerance window. Every difficulty_irt is currently seeded from the
-- Easy/Medium/Hard label, so the eligible pool sits on exactly three values
-- (-1.0, 0.0, +1.0). A ±0.1 window would match nothing for a theta of 0.35
-- and would drive the §7.5 fallback on nearly every pick. Rank by distance,
-- take the closest rung, then break ties on category (§8.1).
--
-- SCOPE — standalone only. Cases and trends are Slice 5.

CREATE OR REPLACE FUNCTION public.cat_next_item(
  p_attempt_id          UUID,
  p_last_answer_payload JSONB,
  p_score_awarded       NUMERIC,
  p_is_correct          BOOLEAN,
  p_theta_after         NUMERIC,
  p_se_after            NUMERIC,
  -- Termination is decided in TypeScript (§9 lives in lib/cat). The caller
  -- passes its verdict; NULL reason = continue. Defaulted so the signature
  -- stays compatible with the §12.7.6 stub shape.
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
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- Own attempt, still live, actually a CAT.
  SELECT * INTO v_attempt
  FROM nclex_attempts
  WHERE attempt_id = p_attempt_id
    AND student_id = v_student;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt not found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_attempt.mode <> 'CAT' THEN
    RAISE EXCEPTION 'not a CAT attempt: %', p_attempt_id;
  END IF;
  IF v_attempt.status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'attempt is already %', v_attempt.status;
  END IF;

  -- The item being answered is the highest-position snapshot.
  SELECT * INTO v_current
  FROM nclex_attempt_items
  WHERE attempt_id = p_attempt_id
  ORDER BY position DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt has no administered item';
  END IF;

  -- ── 1. Record the answer ───────────────────────────────────────────
  -- Idempotent on (attempt_item_id): a retried request overwrites its own
  -- answer rather than double-recording. The score arrives pre-computed
  -- (§10.6); this function never scores.
  INSERT INTO nclex_attempt_answers (
    attempt_id, attempt_item_id, student_id, answer_json,
    submission_status, score_awarded, is_correct, submitted_at
  ) VALUES (
    p_attempt_id, v_current.attempt_item_id, v_student,
    COALESCE(p_last_answer_payload, '{}'::jsonb),
    'SUBMITTED', p_score_awarded, p_is_correct, NOW()
  )
  ON CONFLICT (attempt_item_id) DO UPDATE
    SET answer_json       = EXCLUDED.answer_json,
        score_awarded     = EXCLUDED.score_awarded,
        is_correct        = EXCLUDED.is_correct,
        submitted_at      = EXCLUDED.submitted_at,
        submission_status = EXCLUDED.submission_status,
        updated_at        = NOW();
        -- answer_changes_json is deliberately NOT touched on conflict: it is
        -- the second-guessing log the readiness report reads, and a retry
        -- must not erase it.

  UPDATE nclex_attempts
  SET last_activity_at = NOW(),
      updated_at       = NOW()
  WHERE attempt_id = p_attempt_id;

  -- ── 2. Terminate, if TypeScript said so (§9) ───────────────────────
  IF p_terminate_reason IS NOT NULL THEN
    UPDATE nclex_attempts
    SET status                 = CASE WHEN p_terminate_reason = 'TIME_LIMIT_HIT'
                                      THEN 'TIMED_OUT' ELSE 'COMPLETED' END,
        ended_at               = NOW(),
        cat_verdict            = p_terminate_verdict,
        cat_final_theta        = p_theta_after,
        cat_final_se           = p_se_after,
        cat_termination_reason = p_terminate_reason,
        cat_items_administered = (SELECT COUNT(*) FROM nclex_attempt_items
                                  WHERE attempt_id = p_attempt_id),
        updated_at             = NOW()
    WHERE attempt_id = p_attempt_id;

    RETURN jsonb_build_object(
      'status', 'COMPLETE',
      'verdict_payload', jsonb_build_object(
        'verdict',            p_terminate_verdict,
        'final_theta',        p_theta_after,
        'final_se',           p_se_after,
        'termination_reason', p_terminate_reason,
        'items_administered', (SELECT COUNT(*) FROM nclex_attempt_items
                               WHERE attempt_id = p_attempt_id)
      )
    );
  END IF;

  -- ── 3. Select the next item (§7.1 nearest-neighbour + §8.1) ────────
  v_position := v_current.position + 1;

  -- The under-represented category for the tiebreaker: the Client Needs
  -- category least delivered so far in THIS attempt, read off the
  -- snapshots (§8.3 needs no new storage — it is all derivable).
  SELECT cat INTO v_under
  FROM (
    SELECT c.cat, COUNT(ai.attempt_item_id) AS n
    FROM (VALUES
      ('Safe and Effective Care Environment'),
      ('Health Promotion and Maintenance'),
      ('Psychosocial Integrity'),
      ('Physiological Integrity')
    ) AS c(cat)
    LEFT JOIN nclex_attempt_items ai
      ON ai.attempt_id = p_attempt_id
     AND ai.classification_snapshot->>'client_needs_category' = c.cat
    GROUP BY c.cat
    ORDER BY n ASC, c.cat
    LIMIT 1
  ) least_served;

  -- Nearest-neighbour on difficulty; among everything tied at that exact
  -- distance, prefer the under-represented category; then random.
  -- Category NEVER widens the difficulty match (§7.1, §8.1).
  WITH last3 AS (
    SELECT attempt_id FROM nclex_attempts
    WHERE student_id = v_student AND mode = 'CAT' AND started_at IS NOT NULL
    ORDER BY started_at DESC LIMIT 3
  ),
  seen AS (
    SELECT DISTINCT ai.item_id FROM nclex_attempt_items ai
    JOIN last3 ON last3.attempt_id = ai.attempt_id
  ),
  eligible AS (
    SELECT bi.*, abs(bi.difficulty_irt - p_theta_after) AS dist
    FROM nclex_bank_items bi
    WHERE bi.is_published       IS TRUE
      AND bi.is_builder_visible IS TRUE
      AND bi.difficulty_irt     IS NOT NULL
      AND bi.trend_id           IS NULL                      -- Slice 5
      AND NOT EXISTS (SELECT 1 FROM nclex_case_study_items csi
                      WHERE csi.item_id = bi.item_id)        -- Slice 5
      -- Never re-serve within THIS attempt.
      AND NOT EXISTS (SELECT 1 FROM nclex_attempt_items ai
                      WHERE ai.attempt_id = p_attempt_id AND ai.item_id = bi.item_id)
      AND NOT EXISTS (SELECT 1 FROM seen WHERE seen.item_id = bi.item_id)
  )
  SELECT * INTO v_item
  FROM eligible
  WHERE dist = (SELECT MIN(dist) FROM eligible)
  ORDER BY (client_needs_category IS DISTINCT FROM v_under), random()
  LIMIT 1;

  -- §7.5 fallback — relax EXPOSURE before difficulty. Difficulty match is
  -- sacred; a cross-attempt repeat is the lesser harm. Still never repeats
  -- within the same attempt.
  IF NOT FOUND THEN
    v_relaxed := TRUE;

    WITH eligible AS (
      SELECT bi.*, abs(bi.difficulty_irt - p_theta_after) AS dist
      FROM nclex_bank_items bi
      WHERE bi.is_published       IS TRUE
        AND bi.is_builder_visible IS TRUE
        AND bi.difficulty_irt     IS NOT NULL
        AND bi.trend_id           IS NULL
        AND NOT EXISTS (SELECT 1 FROM nclex_case_study_items csi
                        WHERE csi.item_id = bi.item_id)
        AND NOT EXISTS (SELECT 1 FROM nclex_attempt_items ai
                        WHERE ai.attempt_id = p_attempt_id AND ai.item_id = bi.item_id)
    )
    SELECT * INTO v_item
    FROM eligible
    WHERE dist = (SELECT MIN(dist) FROM eligible)
    ORDER BY (client_needs_category IS DISTINCT FROM v_under), random()
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CAT pool exhausted at position %', v_position;
    END IF;
  END IF;

  -- ── 4. Snapshot it ─────────────────────────────────────────────────
  -- theta/SE BEFORE this question is what the student faced it with — which
  -- is what makes the trajectory reconstructible: item N's theta-after is
  -- item N+1's theta-before. Difficulty is COPIED so recalibration cannot
  -- rewrite history. cat_weight 1.0 = a standalone is full evidence
  -- (§12.7.12). option_order_json '{}' → the shuffle trigger fills it.
  INSERT INTO nclex_attempt_items (
    attempt_id, position, item_id, item_source,
    selection_unit_type, selection_unit_id,
    question_type, stem_snapshot, instruction_snapshot,
    rationale_snapshot, rationale_img_snapshot,
    marks_snapshot, classification_snapshot,
    content_snapshot_json, correct_answer_snapshot_json, option_order_json,
    cat_theta_before, cat_se_before,
    cat_item_difficulty, cat_item_difficulty_source, cat_weight
  ) VALUES (
    p_attempt_id, v_position, v_item.item_id, 'BANK',
    'QUESTION', v_item.item_id,
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
    v_item.difficulty_irt, v_item.difficulty_source, 1.0
  );

  UPDATE nclex_attempts
  SET actual_question_count = v_position,
      actual_unit_count     = v_position,
      updated_at            = NOW()
  WHERE attempt_id = p_attempt_id;

  RETURN jsonb_build_object(
    'status', 'CONTINUE',
    'exposure_relaxed', v_relaxed,
    'next_item_payload', jsonb_build_object(
      'attempt_item_id', (SELECT attempt_item_id FROM nclex_attempt_items
                          WHERE attempt_id = p_attempt_id AND position = v_position),
      'position',        v_position,
      'item_id',         v_item.item_id,
      'question_type',   v_item.question_type,
      'difficulty_irt',  v_item.difficulty_irt
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cat_next_item(UUID, JSONB, NUMERIC, BOOLEAN, NUMERIC, NUMERIC, TEXT, TEXT)
  TO authenticated;
