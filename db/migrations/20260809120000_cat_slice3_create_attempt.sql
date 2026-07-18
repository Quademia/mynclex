-- =========================================================
-- MyNclex — CAT Slice 3: create_cat_attempt
-- File: mynclex/db/migrations/20260809120000_cat_slice3_create_attempt.sql
-- =========================================================
-- Fills in the Slice 1 stub. This is the front door: it turns "the student
-- confirmed at the preflight" into a live exam with its first question
-- snapshotted and waiting.
--
-- Plan: bank-consumption-cat.html §19.4 Slice 3, §10.7, §15.5, §6, §7.1/§7.3,
-- §15.2, §12.7.12.
--
-- §10.7 — ONE ATOMIC ACT. Creation, starting the clock, and spending the
-- allowance all happen here, in one transaction. There is deliberately NO
-- create/start split (readiness has one; CAT does not — see §10.7 for why,
-- and do not "fix" this to match). Consequences honoured below:
--   • started_at is stamped NOW, not left NULL.
--   • the call is IDEMPOTENT — a double-click or a retried request returns
--     the existing attempt rather than opening a second exam and burning a
--     second allowance.
--
-- SOURCE = 'CUSTOM_BUILT', deliberately. There is no 'CAT' source value and
-- none is added: CAT is launched from the Builder under EXAM intent (parent
-- bank-consumption.html §17), so it genuinely is student-built, the
-- source_refs CHECK is satisfied (all four ref columns NULL), and Exit
-- correctly resolves to /student/bank/practice. mode = 'CAT' already
-- identifies a CAT uniquely (the intent_mode_tuple CHECK pairs EXAM+CAT), so
-- a second column saying the same thing would duplicate a fact — the same
-- reasoning that kept the direction out of cat_termination_reason (§9.4).
--
-- SCOPE — standalone questions only. Case children and trend-linked items are
-- Slice 5. Excluding case children at position 1 is required regardless:
-- §7.4 says a case is never at position 1.

-- ── Engine version — one source of truth ─────────────────────────────
-- Stamped onto every attempt at CREATION (§12.7.12) so an ABANDONED CAT
-- still records which formula produced its responses. Kept as a function
-- rather than a literal in two places: the recalibration job (Slice 10) and
-- any future TS caller read the same value.
--
-- Bump this when the ability-update formula changes (§4.4 2PL, §4.5 Option 3).
CREATE OR REPLACE FUNCTION public.nclex_cat_engine_version()
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$ SELECT 'rasch-1pl-eap-v1'::text $$;


CREATE OR REPLACE FUNCTION public.create_cat_attempt(
  p_student_id UUID,
  p_intent     TEXT,
  p_mode       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- 4 hours (§9.3) and the 150-item ceiling (§9.2).
  C_DURATION_SECONDS CONSTANT INTEGER := 4 * 60 * 60;
  C_MAX_ITEMS        CONSTANT INTEGER := 150;
  -- Every CAT opens at theta 0.0 with the §19.4.1 prior's spread as its SE.
  C_START_THETA      CONSTANT NUMERIC := 0.0;
  C_START_SE         CONSTANT NUMERIC := 1.0;

  v_student   UUID := auth.uid();
  v_attempt   UUID;
  v_existing  UUID;
  v_allowed   BOOLEAN;
  v_item      RECORD;
  v_relaxed   BOOLEAN := FALSE;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- The caller passes its own id (the §12.7.6 signature), but auth.uid() is
  -- authoritative. Reject a mismatch rather than trusting the argument.
  IF p_student_id IS DISTINCT FROM v_student THEN
    RAISE EXCEPTION 'student_id does not match the authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_intent <> 'EXAM' OR p_mode <> 'CAT' THEN
    RAISE EXCEPTION 'create_cat_attempt only opens EXAM/CAT attempts (got %/%)',
      p_intent, p_mode;
  END IF;

  -- ── Idempotency (§10.7) ────────────────────────────────────────────
  -- Return the live CAT if one already exists. Checked BEFORE the allowance
  -- so a retry can never be refused by the allowance its own first call
  -- spent.
  SELECT attempt_id INTO v_existing
  FROM nclex_attempts
  WHERE student_id = v_student
    AND mode       = 'CAT'
    AND status     = 'IN_PROGRESS'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'attempt_id', v_existing,
      'resumed',    TRUE,
      'first_item_payload', (
        SELECT jsonb_build_object(
                 'attempt_item_id', ai.attempt_item_id,
                 'position',        ai.position,
                 'item_id',         ai.item_id,
                 'question_type',   ai.question_type)
        FROM nclex_attempt_items ai
        WHERE ai.attempt_id = v_existing
        ORDER BY ai.position DESC
        LIMIT 1
      )
    );
  END IF;

  -- ── Bank access (§15.5.4) ──────────────────────────────────────────
  -- CAT is bank-family. A readiness-only student holds no bank entitlement
  -- and therefore cannot sit one. SUPER_ADMIN bypasses, mirroring
  -- nclex_create_attempt.
  IF NOT nclex_has_active_bank_access(v_student)
     AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'active bank access required for CAT'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Allowance (§15.5) ──────────────────────────────────────────────
  -- MOST-GENEROUS-WINS across stacked active rows: the student may start if
  -- ANY active bank row still has headroom. NULL = unlimited, so today
  -- nobody is refused — the gate exists from day one rather than being
  -- retrofitted into a live RPC.
  --
  -- Counting is per-row, from that row's own started_at. Only STARTED
  -- attempts count; under §10.7 created and started are the same event, so
  -- the filter is belt-and-braces rather than load-bearing — but it is the
  -- filter whose absence §10.7 warns about, so it is written explicitly.
  SELECT EXISTS (
    SELECT 1
    FROM nclex_subscriptions s
    WHERE s.user_id  = v_student
      AND s.status   = 'ACTIVE'
      AND s.pack_type IN ('BANK_DURATION', 'TRIAL')
      AND (s.end_at IS NULL OR s.end_at > NOW())
      AND (
        s.cat_allowance IS NULL
        OR (
          SELECT COUNT(*)
          FROM nclex_attempts a
          WHERE a.student_id = v_student
            AND a.mode       = 'CAT'
            AND a.started_at IS NOT NULL
            AND a.started_at >= s.started_at
        ) < s.cat_allowance
      )
  ) INTO v_allowed;

  IF NOT v_allowed AND NOT nclex_user_has_role('SUPER_ADMIN') THEN
    RAISE EXCEPTION 'CAT allowance exhausted for this subscription window'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Pick the first item (§6, §7.1, §7.3, §15.2) ────────────────────
  -- theta starts at 0.0, so "closest difficulty" means closest to Medium.
  -- Eligibility (§7.3): published + builder-visible (which keeps
  -- readiness-reserved questions out) + an actual numeric difficulty.
  -- Exposure (§15.2): nothing seen in the student's last 3 CATs.
  WITH last3 AS (
    SELECT attempt_id
    FROM nclex_attempts
    WHERE student_id = v_student
      AND mode       = 'CAT'
      AND started_at IS NOT NULL
    ORDER BY started_at DESC
    LIMIT 3
  ),
  seen AS (
    SELECT DISTINCT ai.item_id
    FROM nclex_attempt_items ai
    JOIN last3 ON last3.attempt_id = ai.attempt_id
  )
  SELECT bi.* INTO v_item
  FROM nclex_bank_items bi
  WHERE bi.is_published       IS TRUE
    AND bi.is_builder_visible IS TRUE
    AND bi.difficulty_irt     IS NOT NULL
    AND bi.trend_id           IS NULL                       -- Slice 5
    AND NOT EXISTS (SELECT 1 FROM nclex_case_study_items csi
                    WHERE csi.item_id = bi.item_id)         -- §7.4: never at position 1
    AND NOT EXISTS (SELECT 1 FROM seen WHERE seen.item_id = bi.item_id)
  ORDER BY abs(bi.difficulty_irt - C_START_THETA), random()
  LIMIT 1;

  -- §7.5 fallback: relax EXPOSURE before relaxing difficulty. Difficulty
  -- match is sacred; a repeat is the lesser harm.
  IF NOT FOUND THEN
    v_relaxed := TRUE;

    SELECT bi.* INTO v_item
    FROM nclex_bank_items bi
    WHERE bi.is_published       IS TRUE
      AND bi.is_builder_visible IS TRUE
      AND bi.difficulty_irt     IS NOT NULL
      AND bi.trend_id           IS NULL
      AND NOT EXISTS (SELECT 1 FROM nclex_case_study_items csi
                      WHERE csi.item_id = bi.item_id)
    ORDER BY abs(bi.difficulty_irt - C_START_THETA), random()
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'no CAT-eligible questions available';
    END IF;
  END IF;

  -- ── Open the attempt (§10.7 — started NOW) ─────────────────────────
  -- requested_question_count carries the 150 ceiling: the column is NOT NULL
  -- with a > 0 CHECK, and a CAT's true length (85-150) is unknowable in
  -- advance, so the ceiling is the only honest fixed number available.
  INSERT INTO nclex_attempts (
    student_id, source, intent, mode,
    duration_seconds, filters_json,
    requested_question_count, actual_question_count, actual_unit_count,
    started_at, cat_engine_version
  ) VALUES (
    v_student, 'CUSTOM_BUILT', 'EXAM', 'CAT',
    C_DURATION_SECONDS, jsonb_build_object('mode', 'CAT'),
    C_MAX_ITEMS, 1, 1,
    NOW(), nclex_cat_engine_version()
  )
  RETURNING attempt_id INTO v_attempt;

  -- ── Snapshot item 1 ────────────────────────────────────────────────
  -- Same four-table snapshot shape every other create path uses, so the
  -- runner, timer, scoring and review all reuse unchanged. option_order_json
  -- is left '{}' on purpose: the BEFORE INSERT shuffle trigger fills it.
  --
  -- cat_theta_before / cat_se_before record the estimate the student faced
  -- this question with. cat_item_difficulty is COPIED, not joined, so
  -- recalibration cannot retroactively rewrite what a past exam measured
  -- against. cat_weight = 1.0 — a standalone question is full evidence
  -- (§12.7.12); leaving it NULL would silently disable the §7.4 tuning the
  -- column exists for.
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
    v_attempt, 1, v_item.item_id, 'BANK',
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
    C_START_THETA, C_START_SE,
    v_item.difficulty_irt, v_item.difficulty_source, 1.0
  );

  RETURN jsonb_build_object(
    'attempt_id', v_attempt,
    'resumed',    FALSE,
    -- Logged so §7.5 fallbacks can be counted: "X% of CAT picks fell back to
    -- repeats" is the curator signal that the pool is too thin (§15.3).
    'exposure_relaxed', v_relaxed,
    'first_item_payload', jsonb_build_object(
      'attempt_item_id', (SELECT attempt_item_id FROM nclex_attempt_items
                          WHERE attempt_id = v_attempt AND position = 1),
      'position',        1,
      'item_id',         v_item.item_id,
      'question_type',   v_item.question_type
    )
  );
END;
$function$;

-- Now callable: the Slice 1 stub was deliberately ungranted (§12.7.6).
GRANT EXECUTE ON FUNCTION public.create_cat_attempt(UUID, TEXT, TEXT) TO authenticated;
