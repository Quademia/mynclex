-- 20260730120000_readiness_create_attempt.sql
--
-- Readiness step 2b-i — attempt creation for the READINESS_PACK source.
--
-- The existing nclex_create_attempt hard-rejects readiness (source must be
-- CUSTOM_BUILT, it requires a bank subscription, and it picks questions
-- RANDOMLY from a filter pool). A readiness sitting is the opposite: the
-- FIXED 100 pack members, in their curated position order. So readiness gets
-- its own creation function.
--
-- It writes to the SAME four attempt tables nclex_create_attempt writes to
-- (nclex_attempts + nclex_attempt_items + the case/trend snapshot tables) —
-- which is exactly why the runner, timer, scoring and review all reuse
-- unchanged: the sitting lands as an ordinary attempt and the runner never
-- knows it is a pack. No new tables (the attempt tables already carry the
-- READINESS_PACK source + FK + integrity CHECKs).
--
-- What differs from nclex_create_attempt:
--   • members come from nclex_readiness_pack_items in POSITION order, not a
--     random filter pool. Pack members are already flattened to per-child
--     rows (readiness-packs.md §6), so each row is one question and case
--     children are consecutive — we classify each row (case child vs
--     standalone/trend) instead of expanding whole units.
--   • gated on an ACTIVE readiness credit for the pack, not a bank sub.
--   • mode = TIMED_SEQUENTIAL (exam-authentic), duration = the pack's own
--     time_limit_sec, intent = EXAM. duration is baked here; the clock only
--     starts when the preflight calls the start path (2b-ii), which also
--     stamps the credit's used_at + attempt_id together (the CHECK couples
--     them) — that is where "the shot is spent" (§2 r1).
--
-- The shot is NOT spent here: creation leaves the attempt started_at NULL and
-- the credit untouched. Bouncing off the preflight costs nothing, and a
-- repeated Begin reuses the unstarted attempt (idempotent) rather than
-- building a second one.

CREATE OR REPLACE FUNCTION public.nclex_create_readiness_attempt(p_pack_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student    UUID := auth.uid();
  v_attempt_id UUID;
  v_existing   UUID;
  v_n          INTEGER;
  v_duration   INTEGER;
  v_published  BOOLEAN;
  v_status     TEXT;
  v_position   INTEGER := 0;
  v_count      INTEGER := 0;
  v_units      INTEGER := 0;
  v_prev_case  TEXT := NULL;
  r_mem        RECORD;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- Pack must exist and be available (published + active).
  SELECT n, time_limit_sec, published, status
  INTO v_n, v_duration, v_published, v_status
  FROM nclex_readiness_packs
  WHERE pack_id = p_pack_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pack not found: %', p_pack_id;
  END IF;
  IF v_published IS NOT TRUE OR v_status <> 'active' THEN
    RAISE EXCEPTION 'pack is not available: %', p_pack_id;
  END IF;
  IF v_duration IS NULL OR v_duration <= 0 THEN
    RAISE EXCEPTION 'pack has no time limit: %', p_pack_id;
  END IF;

  -- The caller must hold an ACTIVE credit for THIS pack: activated (the
  -- 21-day window started), not yet sat, not lapsed/revoked, and the
  -- deadline has not passed. Stage ACTIVE per lib/payments/readiness-credits
  -- (activated_at set, no terminal stamp). The expires_at > now() guard
  -- blocks a window whose deadline slipped past before the nightly sweep
  -- stamped expired_at (§2 r2/r3 — the window governs whether you may start).
  PERFORM 1
  FROM nclex_readiness_credits
  WHERE user_id = v_student
    AND pack_id = p_pack_id
    AND activated_at IS NOT NULL
    AND used_at     IS NULL
    AND expired_at  IS NULL
    AND revoked_at  IS NULL
    AND expires_at  > NOW();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no active readiness credit for this pack'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotent Begin: reuse an unstarted sitting already built for this pack
  -- (student clicked Begin, landed on the preflight, backed out, clicked
  -- again). Once started, the credit is USED and the card no longer offers
  -- Begin, so we never need to reuse a started attempt here.
  SELECT attempt_id INTO v_existing
  FROM nclex_attempts
  WHERE student_id       = v_student
    AND source           = 'READINESS_PACK'
    AND readiness_pack_id = p_pack_id
    AND status           = 'IN_PROGRESS'
    AND started_at       IS NULL
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Build the attempt row. status defaults IN_PROGRESS, started_at NULL.
  INSERT INTO nclex_attempts (
    student_id, source, readiness_pack_id, intent, mode, duration_seconds,
    filters_json, requested_question_count, actual_question_count, actual_unit_count
  ) VALUES (
    v_student, 'READINESS_PACK', p_pack_id, 'EXAM', 'TIMED_SEQUENTIAL', v_duration,
    '{}'::jsonb, GREATEST(COALESCE(v_n, 0), 1), 0, 0
  )
  RETURNING attempt_id INTO v_attempt_id;

  -- Walk members in position order. Each is one question; case children are
  -- consecutive and carry their case linkage via nclex_case_study_items.
  FOR r_mem IN
    SELECT bi.*,
           csi.case_id  AS csi_case,
           csi.position AS csi_pos,
           csi.cjmm_step AS csi_step
    FROM nclex_readiness_pack_items i
    JOIN nclex_bank_items bi ON bi.item_id = i.item_id
    LEFT JOIN nclex_case_study_items csi ON csi.item_id = i.item_id
    WHERE i.pack_id = p_pack_id
    ORDER BY i.position
  LOOP
    v_position := v_position + 1;

    IF r_mem.csi_case IS NOT NULL THEN
      -- Case child. Ensure the case snapshot exists (once per case).
      INSERT INTO nclex_attempt_case_snapshots (
        attempt_id, case_id, title_snapshot, scenario_summary_snapshot, tabs_snapshot_json
      )
      SELECT
        v_attempt_id, cs.case_id, cs.title, cs.scenario_summary,
        COALESCE(
          (SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.display_order)
           FROM nclex_case_study_tabs t
           WHERE t.case_id = cs.case_id),
          '[]'::jsonb
        )
      FROM nclex_case_studies cs
      WHERE cs.case_id = r_mem.csi_case
      ON CONFLICT (attempt_id, case_id) DO NOTHING;

      IF r_mem.csi_case IS DISTINCT FROM v_prev_case THEN
        v_units := v_units + 1;
        v_prev_case := r_mem.csi_case;
      END IF;

      INSERT INTO nclex_attempt_items (
        attempt_id, position, item_id, item_source,
        selection_unit_type, selection_unit_id,
        parent_case_id, case_position, cjmm_step, trend_id,
        question_type, stem_snapshot, instruction_snapshot,
        rationale_snapshot, rationale_img_snapshot,
        marks_snapshot, classification_snapshot,
        content_snapshot_json, correct_answer_snapshot_json, option_order_json
      ) VALUES (
        v_attempt_id, v_position, r_mem.item_id, 'BANK',
        'CASE', r_mem.csi_case,
        r_mem.csi_case, r_mem.csi_pos, r_mem.csi_step, r_mem.trend_id,
        r_mem.question_type, r_mem.stem, r_mem.instruction,
        r_mem.rationale, r_mem.rationale_img,
        COALESCE(r_mem.marks, 1),
        jsonb_build_object(
          'client_needs_category',    r_mem.client_needs_category,
          'client_needs_subcategory', r_mem.client_needs_subcategory,
          'nursing_subject',          r_mem.nursing_subject,
          'body_system',              r_mem.body_system,
          'topic',                    r_mem.topic,
          'subtopic',                 r_mem.subtopic,
          'difficulty',               r_mem.difficulty,
          'tags',                     to_jsonb(r_mem.tags)
        ),
        COALESCE(r_mem.content, '{}'::jsonb),
        COALESCE(r_mem.correct, '{}'::jsonb),
        '{}'::jsonb
      );

    ELSE
      -- Standalone question (possibly trend-linked).
      IF r_mem.trend_id IS NOT NULL THEN
        INSERT INTO nclex_attempt_trend_snapshots (
          attempt_id, trend_id, title_snapshot, scenario_snapshot, tabs_snapshot_json
        )
        SELECT
          v_attempt_id, td.trend_id, td.title, td.scenario,
          COALESCE(
            (SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.display_order)
             FROM nclex_trend_tabs t
             WHERE t.trend_id = td.trend_id),
            '[]'::jsonb
          )
        FROM nclex_trend_datasets td
        WHERE td.trend_id = r_mem.trend_id
        ON CONFLICT (attempt_id, trend_id) DO NOTHING;
      END IF;

      v_units := v_units + 1;

      INSERT INTO nclex_attempt_items (
        attempt_id, position, item_id, item_source,
        selection_unit_type, selection_unit_id, trend_id,
        question_type, stem_snapshot, instruction_snapshot,
        rationale_snapshot, rationale_img_snapshot,
        marks_snapshot, classification_snapshot,
        content_snapshot_json, correct_answer_snapshot_json, option_order_json
      ) VALUES (
        v_attempt_id, v_position, r_mem.item_id, 'BANK',
        'QUESTION', r_mem.item_id, r_mem.trend_id,
        r_mem.question_type, r_mem.stem, r_mem.instruction,
        r_mem.rationale, r_mem.rationale_img,
        COALESCE(r_mem.marks, 1),
        jsonb_build_object(
          'client_needs_category',    r_mem.client_needs_category,
          'client_needs_subcategory', r_mem.client_needs_subcategory,
          'nursing_subject',          r_mem.nursing_subject,
          'body_system',              r_mem.body_system,
          'topic',                    r_mem.topic,
          'subtopic',                 r_mem.subtopic,
          'difficulty',               r_mem.difficulty,
          'tags',                     to_jsonb(r_mem.tags)
        ),
        COALESCE(r_mem.content, '{}'::jsonb),
        COALESCE(r_mem.correct, '{}'::jsonb),
        '{}'::jsonb
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'pack has no members: %', p_pack_id;
  END IF;

  UPDATE nclex_attempts
  SET actual_question_count = v_count,
      actual_unit_count     = v_units,
      updated_at            = NOW()
  WHERE attempt_id = v_attempt_id;

  RETURN v_attempt_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.nclex_create_readiness_attempt(text) TO authenticated;
