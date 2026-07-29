-- ─────────────────────────────────────────────────────────────────────
-- Student Case Study bank — /student/bank/cases
-- ─────────────────────────────────────────────────────────────────────
-- A student-facing list of every published case study, takeable directly
-- (1 or 2 cases per run) through the existing runner. Three SQL objects:
--
--   1. _nclex_case_bank_pool(student)   — the ONE eligibility helper the
--      list and the launch both read, so they cannot disagree about what
--      is takeable (the same one-gateway property 10b3 gave practice).
--   2. nclex_case_bank_list()           — rows for the page.
--   3. nclex_create_case_attempt(...)   — build an attempt from exactly
--      the 1–2 cases the student picked.
--
-- ── Why this does NOT go through _nclex_eligible_unit_pool ───────────
-- Every practice path funnels through that helper, and since 10b3 it
-- hard-excludes reserved stock (cat_pool = FALSE). This surface needs the
-- opposite in one narrow spot: a reserved case the student has ALREADY
-- MET in a CAT or readiness sitting is no longer being protected from
-- them — it unlocks. Teaching the practice helper that rule would leak
-- reserved stock into the ordinary builder and shift its counts, exactly
-- the guarantee 10b3 exists to make. So the case bank gets its own pair
-- of functions sharing their own helper.
--
-- ── The lock rule ────────────────────────────────────────────────────
-- locked = (reserved for CAT ∨ member of a readiness pack) ∧ NOT seen.
--
-- "Seen" = the case appeared in one of the student's attempts AND either
-- that attempt is finished, OR the student submitted an answer to one of
-- its questions. The union matters:
--   · a readiness pack snapshots all its questions the moment the attempt
--    row is created — "a row exists" alone would unlock a pack the
--    student never opened;
--   · a CAT abandoned halfway genuinely showed the student the cases it
--    served — "attempt finished" alone would keep those locked.
--
-- ── The reason never reaches the browser ─────────────────────────────
-- (Sam, 2026-07-29.) The list RPC returns a bare `locked` and never says
-- WHY — no cat_pool, no pack membership, not even distinguishably in an
-- error message. A locked case also ships NO scenario text (that is exam
-- content): title + derived clinical axes only.
-- ─────────────────────────────────────────────────────────────────────


-- ── 1. The shared eligibility helper ─────────────────────────────────
-- One row per published case with 6 published children (the same
-- completeness rule _nclex_eligible_unit_pool applies — an unpublished
-- child must not leak a broken case here either).

CREATE OR REPLACE FUNCTION _nclex_case_bank_pool(p_student_id UUID)
RETURNS TABLE (case_id TEXT, locked BOOLEAN, seen BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$

  WITH pub AS (
    SELECT cs.case_id, cs.cat_pool
    FROM nclex_case_studies cs
    WHERE cs.is_published = TRUE
      AND (
        SELECT COUNT(DISTINCT csi.position)
        FROM nclex_case_study_items csi
        JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
        WHERE csi.case_id = cs.case_id
          AND csi.position BETWEEN 1 AND 6
          AND bi.is_published = TRUE
      ) = 6
  ),

  flags AS (
    SELECT
      p.case_id,
      -- Reserved = CAT pool ∨ any child sits in a readiness pack. The
      -- pack test is per-child because pack membership is stored per
      -- question (nclex_readiness_pack_items), never per wrapper.
      (p.cat_pool OR EXISTS (
        SELECT 1
        FROM nclex_case_study_items csi
        JOIN nclex_readiness_pack_items rpi ON rpi.item_id = csi.item_id
        WHERE csi.case_id = p.case_id
      )) AS reserved,
      EXISTS (
        SELECT 1
        FROM nclex_attempt_items ai
        JOIN nclex_attempts a ON a.attempt_id = ai.attempt_id
        WHERE ai.parent_case_id = p.case_id
          AND a.student_id = p_student_id
          AND (
            a.status IN ('COMPLETED','TIMED_OUT')
            OR EXISTS (
              SELECT 1 FROM nclex_attempt_answers aa
              WHERE aa.attempt_item_id = ai.attempt_item_id
                AND aa.submission_status IN ('SUBMITTED','AUTO_SUBMITTED')
            )
          )
      ) AS seen
    FROM pub p
  )

  SELECT
    f.case_id,
    (f.reserved AND NOT f.seen) AS locked,
    f.seen
  FROM flags f;

$$;


-- ── 2. The list RPC ──────────────────────────────────────────────────
-- One JSONB array, one row per case. Scenario text only for unlocked
-- rows (and even then the app layer sends the client a derived snippet,
-- not this raw value). `last` = the student's most recent FINISHED
-- attempt containing the case: its id (Review target), an
-- item-equivalent-average percent over the case's own children (the
-- scoring convention final_score uses — scoring doc §7), and when.
-- A seen case with no finished attempt renders "In progress" client-side
-- (seen = TRUE, last = NULL); no extra field needed.

CREATE OR REPLACE FUNCTION nclex_case_bank_list()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student UUID := auth.uid();
  v_rows    JSONB;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  WITH pool AS (
    SELECT * FROM _nclex_case_bank_pool(v_student)
  ),

  -- The row's clinical label: the DOMINANT value per axis, not every
  -- distinct one.
  --
  -- A case's six children legitimately span subjects — that is the NGN
  -- design, where one step might be a delegation question — so listing
  -- them all describes the QUESTIONS rather than the case. Measured on
  -- dev: it dragged "Leadership and Management" onto a peritoneal-dialysis
  -- case and ran to 86 characters, wrapping onto a second line and coming
  -- out longer than the title it sat under.
  --
  -- Dominant = whichever value the most children carry. Ties go to the
  -- value on the earliest case position, because position 1 is "Recognise
  -- cues" — the step that establishes what the case is about — with an
  -- alphabetical final tiebreak so the result is deterministic.
  axes AS (
    SELECT
      p.case_id,
      (SELECT bi.nursing_subject
       FROM nclex_case_study_items csi
       JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
       WHERE csi.case_id = p.case_id AND bi.nursing_subject IS NOT NULL
       GROUP BY bi.nursing_subject
       ORDER BY COUNT(*) DESC, MIN(csi.position) ASC, bi.nursing_subject ASC
       LIMIT 1) AS subject,
      (SELECT bi.body_system
       FROM nclex_case_study_items csi
       JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
       WHERE csi.case_id = p.case_id AND bi.body_system IS NOT NULL
       GROUP BY bi.body_system
       ORDER BY COUNT(*) DESC, MIN(csi.position) ASC, bi.body_system ASC
       LIMIT 1) AS body
    FROM pool p
  ),

  -- Most recent finished attempt per case, scored over that case's own
  -- children within that attempt. Skipped/unanswered children count 0
  -- (COALESCE), matching how a finished sitting grades them.
  last_finished AS (
    SELECT DISTINCT ON (ai.parent_case_id)
      ai.parent_case_id AS case_id,
      a.attempt_id,
      a.ended_at,
      (SELECT ROUND(100 * AVG(
                COALESCE(aa2.score_awarded, 0) / ai2.marks_snapshot))
       FROM nclex_attempt_items ai2
       LEFT JOIN nclex_attempt_answers aa2
         ON aa2.attempt_item_id = ai2.attempt_item_id
        AND aa2.submission_status IN ('SUBMITTED','AUTO_SUBMITTED')
       WHERE ai2.attempt_id = a.attempt_id
         AND ai2.parent_case_id = ai.parent_case_id) AS pct
    FROM nclex_attempt_items ai
    JOIN nclex_attempts a ON a.attempt_id = ai.attempt_id
    WHERE a.student_id = v_student
      AND a.status IN ('COMPLETED','TIMED_OUT')
      AND ai.parent_case_id IS NOT NULL
    ORDER BY ai.parent_case_id, a.ended_at DESC NULLS LAST
  )

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'case_id',  p.case_id,
      'title',    cs.title,
      'locked',   p.locked,
      'seen',     p.seen,
      -- Exam content stays server-side while the lock stands.
      'scenario', CASE WHEN p.locked THEN NULL ELSE cs.scenario_summary END,
      'subject',  ax.subject,
      'body',     ax.body,
      'last',     CASE WHEN lf.case_id IS NULL THEN NULL ELSE
                    jsonb_build_object(
                      'attempt_id', lf.attempt_id,
                      'pct',        lf.pct,
                      'ended_at',   lf.ended_at
                    )
                  END
    ) ORDER BY cs.title
  ), '[]'::jsonb)
  INTO v_rows
  FROM pool p
  JOIN nclex_case_studies cs ON cs.case_id = p.case_id
  JOIN axes ax ON ax.case_id = p.case_id
  LEFT JOIN last_finished lf ON lf.case_id = p.case_id;

  RETURN v_rows;
END;
$$;


-- ── 3. The launch RPC ────────────────────────────────────────────────
-- Takes exactly the 1–2 case ids the student picked (in their chosen
-- order), re-validates them against the SAME helper the list read —
-- a stale tab or a hand-crafted call cannot start a locked case — and
-- snapshots them the way nclex_create_attempt's CASE branch does.
--
-- STUDY intent only, the three STUDY modes only (what the surface
-- offers). duration_seconds for TIMED_FREE_NAV comes from the existing
-- BEFORE INSERT trigger (requested_question_count × 90 — migration
-- 20260509140000), not from here.
--
-- filters_json carries a marker shape ({"case_bank": [ids]}) instead of
-- practice-filter axes. Nothing in app code reads nclex_attempts.
-- filters_json today (checked 2026-07-29); the marker records honestly
-- how the attempt was built.

CREATE OR REPLACE FUNCTION nclex_create_case_attempt(
  p_case_ids TEXT[],
  p_mode     TEXT
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student    UUID := auth.uid();
  v_attempt_id UUID;
  v_case_id    TEXT;
  v_position   INTEGER := 0;
  v_running    INTEGER := 0;
  r_child      RECORD;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT (nclex_user_has_role('SUPER_ADMIN') OR nclex_has_active_bank_access(v_student)) THEN
    RAISE EXCEPTION 'active bank subscription required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_mode NOT IN ('UNTIMED_LEARNING','UNTIMED_TEST','TIMED_FREE_NAV') THEN
    RAISE EXCEPTION 'mode not offered on the case bank: %', p_mode;
  END IF;

  IF p_case_ids IS NULL
     OR array_length(p_case_ids, 1) IS NULL
     OR array_length(p_case_ids, 1) > 2 THEN
    RAISE EXCEPTION 'pick 1 or 2 cases (got %)',
      COALESCE(array_length(p_case_ids, 1), 0);
  END IF;

  IF array_length(p_case_ids, 1) = 2 AND p_case_ids[1] = p_case_ids[2] THEN
    RAISE EXCEPTION 'the same case cannot be added twice';
  END IF;

  -- Every requested case must be in the pool AND not locked. One neutral
  -- error for both "doesn't exist / not published" and "locked" — the
  -- message must not reveal which, or why.
  FOREACH v_case_id IN ARRAY p_case_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM _nclex_case_bank_pool(v_student) p
      WHERE p.case_id = v_case_id AND p.locked = FALSE
    ) THEN
      RAISE EXCEPTION 'case not available: %', v_case_id;
    END IF;
  END LOOP;

  INSERT INTO nclex_attempts (
    student_id, source, intent, mode, filters_json,
    requested_question_count, actual_question_count, actual_unit_count
  ) VALUES (
    v_student, 'CUSTOM_BUILT', 'STUDY', p_mode,
    jsonb_build_object('case_bank', to_jsonb(p_case_ids)),
    6 * array_length(p_case_ids, 1), 0, 0
  )
  RETURNING attempt_id INTO v_attempt_id;

  -- Snapshot each case in the student's chosen order — the same shape as
  -- nclex_create_attempt's CASE branch (case snapshot first: the child
  -- rows' (attempt_id, parent_case_id) FK points at it).
  FOREACH v_case_id IN ARRAY p_case_ids LOOP

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
    FROM nclex_case_studies cs WHERE cs.case_id = v_case_id;

    FOR r_child IN
      SELECT csi.position AS case_position, csi.cjmm_step, bi.*
      FROM nclex_case_study_items csi
      JOIN nclex_bank_items bi ON bi.item_id = csi.item_id
      WHERE csi.case_id = v_case_id
      ORDER BY csi.position
    LOOP
      v_position := v_position + 1;
      INSERT INTO nclex_attempt_items (
        attempt_id, position, item_id, item_source,
        selection_unit_type, selection_unit_id,
        parent_case_id, case_position, cjmm_step,
        trend_id,
        question_type, stem_snapshot, instruction_snapshot,
        rationale_snapshot, rationale_img_snapshot,
        marks_snapshot, classification_snapshot,
        content_snapshot_json, correct_answer_snapshot_json,
        option_order_json
      ) VALUES (
        v_attempt_id, v_position, r_child.item_id, 'BANK',
        'CASE', v_case_id,
        v_case_id, r_child.case_position, r_child.cjmm_step,
        r_child.trend_id,
        r_child.question_type, r_child.stem, r_child.instruction,
        r_child.rationale, r_child.rationale_img,
        COALESCE(r_child.marks, 1),
        jsonb_build_object(
          'client_needs_category',    r_child.client_needs_category,
          'client_needs_subcategory', r_child.client_needs_subcategory,
          'nursing_subject',          r_child.nursing_subject,
          'body_system',              r_child.body_system,
          'topic',                    r_child.topic,
          'subtopic',                 r_child.subtopic,
          'difficulty_irt',           r_child.difficulty_irt,
          'tags',                     to_jsonb(r_child.tags)
        ),
        COALESCE(r_child.content, '{}'::jsonb),
        COALESCE(r_child.correct, '{}'::jsonb),
        '{}'::jsonb
      );
    END LOOP;

    v_running := v_running + 6;
  END LOOP;

  UPDATE nclex_attempts
  SET actual_question_count = v_running,
      actual_unit_count     = array_length(p_case_ids, 1),
      updated_at            = NOW()
  WHERE attempt_id = v_attempt_id;

  RETURN v_attempt_id;
END;
$$;


-- ── Grants ───────────────────────────────────────────────────────────
-- Same posture as slice 2.2a: revoke the Supabase defaults explicitly,
-- grant back only authenticated. The helper takes an arbitrary
-- student_id, so it gets NO grant at all — the two public RPCs reach it
-- through their SECURITY DEFINER context.

REVOKE EXECUTE ON FUNCTION _nclex_case_bank_pool(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION nclex_case_bank_list()
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION nclex_create_case_attempt(TEXT[], TEXT)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION nclex_case_bank_list()                    TO authenticated;
GRANT EXECUTE ON FUNCTION nclex_create_case_attempt(TEXT[], TEXT)   TO authenticated;
