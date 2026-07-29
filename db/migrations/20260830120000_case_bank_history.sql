-- ─────────────────────────────────────────────────────────────────────
-- Case Study bank — per-case attempt history
-- ─────────────────────────────────────────────────────────────────────
-- Replaces the list RPC's single `last` score with the case's whole
-- attempt history. Four changes, one shape (Sam, 2026-07-29):
--
--   1. A case met ONLY in an exam stays in "Ready to sit" until it has
--      been sat here — so the Review button can only ever point at a 1-
--      or 2-case run, never at a 100-question sitting. Driven by the new
--      `sat_here`, not by `seen` (which still drives the unlock, and is
--      unchanged).
--   2. Every finished sitting containing the case is returned, newest
--      first, so a student drilling a case sees 22% → 45% → 85% instead
--      of just the latest number. The progression is the point of
--      reattempting; keeping only the last one discarded it.
--   3. The exam sitting is one of those entries, WITH its score — it is
--      genuinely the first attempt. `origin` says which kind it was so
--      the client can send it to the right place: a readiness sitting
--      belongs in its pack report and a CAT in its result page, not in
--      the runner. That is what stops any entry opening a 100-question
--      exam.
--   4. `answered` / `served` travel with each entry. A bare percentage
--      conflates "did badly" with "did not finish" — 50% meant 75% on
--      the four of six actually answered in a real dev row. `served` is
--      normally 6 but is NOT assumed: a CAT terminates on its own rules,
--      not on case boundaries, so it can stop partway through a case.
--      (Zero occurrences on dev today; 6 of 18 sittings do have
--      unanswered questions, so the answered half already bites.)
--
-- Unchanged: the eligibility helper, the unlock rule, the launch RPC,
-- the entitlement gate, and the runner.
-- ─────────────────────────────────────────────────────────────────────

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

  -- Entitlement, not just authentication. The page already bounces a
  -- non-subscriber, but this RPC returns scenario TEXT for every unlocked
  -- case — content behind the subscription — so a direct call with a valid
  -- token had to be refused here too, not only in the UI.
  --
  -- ⓘ This is stricter than the practice read RPCs
  -- (nclex_count_eligible_items / nclex_filter_breakdown check auth only;
  -- the entitlement gate went on the write paths in 20260605120000). The
  -- difference is what leaks: those return counts, this returns content.
  --
  -- Mirrors requireActiveBankSubscription() exactly, SUPER_ADMIN bypass
  -- included, so the page gate and this one cannot disagree.
  IF NOT (nclex_user_has_role('SUPER_ADMIN') OR nclex_has_active_bank_access(v_student)) THEN
    RAISE EXCEPTION 'active bank subscription required'
      USING ERRCODE = 'insufficient_privilege';
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

  -- One row per (case, finished sitting). Scored over that case's own
  -- children within that sitting: marks earned ÷ marks available per
  -- question, averaged, so a 13-mark bow-tie counts as one question and
  -- not as thirteen (the item-equivalent average `final_score` uses).
  --
  -- The submitted-status test sits in the JOIN, not the WHERE. In the
  -- WHERE it would DROP unanswered children from the average instead of
  -- scoring them zero, quietly inflating every score to "how you did on
  -- what you bothered with".
  case_attempts AS (
    SELECT
      ai.parent_case_id AS case_id,
      a.attempt_id,
      a.ended_at,
      CASE
        WHEN a.mode   = 'CAT'                 THEN 'CAT'
        WHEN a.source = 'READINESS_PACK'      THEN 'READINESS'
        WHEN a.filters_json ? 'case_bank'     THEN 'CASE_BANK'
        WHEN a.source = 'PROGRAMME_ASSIGNED'  THEN 'PROGRAMME'
        ELSE 'PRACTICE'
      END AS origin,
      COUNT(*) AS served,
      COUNT(aa.attempt_item_id) AS answered,
      ROUND(100 * AVG(COALESCE(aa.score_awarded, 0) / ai.marks_snapshot)) AS pct
    FROM nclex_attempt_items ai
    JOIN nclex_attempts a ON a.attempt_id = ai.attempt_id
    LEFT JOIN nclex_attempt_answers aa
      ON aa.attempt_item_id = ai.attempt_item_id
     AND aa.submission_status IN ('SUBMITTED','AUTO_SUBMITTED')
    WHERE a.student_id = v_student
      AND a.status IN ('COMPLETED','TIMED_OUT')
      AND ai.parent_case_id IS NOT NULL
    GROUP BY ai.parent_case_id, a.attempt_id, a.ended_at, a.mode, a.source, a.filters_json
  ),

  -- `total` and `sat_here` are windowed over ALL of a case's sittings
  -- BEFORE the top-10 cut, so capping the list cannot change either one.
  ranked AS (
    SELECT
      ca.*,
      ROW_NUMBER() OVER (PARTITION BY ca.case_id ORDER BY ca.ended_at DESC NULLS LAST) AS rn,
      COUNT(*)    OVER (PARTITION BY ca.case_id)                                       AS total,
      BOOL_OR(ca.origin = 'CASE_BANK') OVER (PARTITION BY ca.case_id)                  AS sat_here
    FROM case_attempts ca
  ),

  history AS (
    SELECT
      r.case_id,
      MAX(r.total)      AS attempts_total,
      BOOL_OR(r.sat_here) AS sat_here,
      jsonb_agg(
        jsonb_build_object(
          'attempt_id', r.attempt_id,
          'ended_at',   r.ended_at,
          'pct',        r.pct,
          'answered',   r.answered,
          'served',     r.served,
          'origin',     r.origin
        ) ORDER BY r.ended_at DESC NULLS LAST
      ) AS entries
    FROM ranked r
    WHERE r.rn <= 10          -- a case is not sat fifty times; the total is still exact
    GROUP BY r.case_id
  ),

  -- Sitting this case RIGHT NOW, from this page. Keeps the "In progress"
  -- row marker honest now that the history only carries finished
  -- sittings — without it a half-done run would read as "Ready to sit".
  in_flight AS (
    SELECT DISTINCT ai.parent_case_id AS case_id
    FROM nclex_attempt_items ai
    JOIN nclex_attempts a ON a.attempt_id = ai.attempt_id
    WHERE a.student_id = v_student
      AND a.status = 'IN_PROGRESS'
      AND a.filters_json ? 'case_bank'
      AND ai.parent_case_id IS NOT NULL
  )

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'case_id',        p.case_id,
      'title',          cs.title,
      'locked',         p.locked,
      -- Exam content stays server-side while the lock stands.
      'scenario',       CASE WHEN p.locked THEN NULL ELSE cs.scenario_summary END,
      'subject',        ax.subject,
      'body',           ax.body,
      'sat_here',       COALESCE(h.sat_here, FALSE),
      'in_progress',    (inf.case_id IS NOT NULL),
      'attempts_total', COALESCE(h.attempts_total, 0),
      'history',        COALESCE(h.entries, '[]'::jsonb)
    ) ORDER BY cs.title
  ), '[]'::jsonb)
  INTO v_rows
  FROM pool p
  JOIN nclex_case_studies cs ON cs.case_id = p.case_id
  JOIN axes ax ON ax.case_id = p.case_id
  LEFT JOIN history h  ON h.case_id  = p.case_id
  LEFT JOIN in_flight inf ON inf.case_id = p.case_id;

  RETURN v_rows;
END;
$$;
