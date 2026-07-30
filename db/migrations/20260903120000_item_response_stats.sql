-- ─────────────────────────────────────────────────────────────────────
-- Item response statistics — "how did everyone else do on this?"
-- ─────────────────────────────────────────────────────────────────────
-- The last figure on the review scoring strip. Everything else there is
-- already on the page; this is the only part that needs the rest of the
-- world.
--
-- ⚠ NOT CALLED "COHORT". The design prototype labelled it that, and the
-- word is already taken here: a cohort is a group of students enrolled
-- together in a programme run (nclex_cohort_*, ~219 files). Worse than a
-- clash, it points a reader at the wrong set — a tutor seeing "cohort"
-- would reasonably read "my class", when this is every student who has
-- ever answered the question. The one view where the word WOULD be true
-- (a tutor looking at their own students) is the one place we don't use
-- it. Same shape as "mark" meaning two things; caught before shipping
-- this time.
--
-- WHY A TABLE AND NOT COLUMNS ON THE QUESTION.
-- Storing derived numbers on nclex_bank_items was considered — there is
-- even precedent, since difficulty_irt is exactly that. Three things
-- rule it out:
--   1. RLS. nclex_bank_items_read_published is USING (is_published =
--      true), so every signed-in user can read every column of every
--      published question. The raw counts would be one API call away,
--      INCLUDING for a question answered once — where that one answer is
--      the reader's own. The threshold below would then guard numbers
--      that had already left the building.
--   2. nclex_bank_items_audit writes a history row on every UPDATE. A
--      nightly refresh touches every question that gained an answer, so
--      the log that answers "who edited this question" would fill with
--      machine writes.
--   3. Three BEFORE INSERT OR UPDATE triggers fire on any update at all,
--      including the CAT seal trigger, which runs a pack-membership
--      subquery per row and can raise.
--
-- WHY IN THE DATABASE AND NOT THE RECALIBRATION JOB.
-- .github/workflows/recalibrate.yml states the rule: the enrolment sweep
-- is a pg_cron function because "it applies rules, each row decided on
-- its own"; recalibration is outside because it solves for unknowns
-- iteratively, where bugs are silent and the CPU cost is real. Counting
-- answers is emphatically the first kind — each question's counts depend
-- only on its own answers, and counting fails loudly. The calibration job
-- also reads BANK only, and deliberately (the IRT scale is one bank-wide
-- scale; a tutor's dozen students must never enter it), so the moment
-- tutor questions came into scope this could never have ridden along on
-- that pass anyway.
--
-- COUNTS, NOT PERCENTAGES. Students see a percentage, gated at 30.
-- Tutors see a raw fraction with no threshold, because a percentage
-- needs a large n to mean anything and a fraction does not: "3 of 11 of
-- your students" is honest at n=11, "27%" is not. One row serves both,
-- plus a future curator "hardest questions" view, because the row does
-- not pre-decide the presentation.


-- ── 1. the table ─────────────────────────────────────────────────────
-- Key is (item_source, item_id). Both id spaces are TEXT and independent,
-- so a single-column key could silently merge a bank question and a tutor
-- question that happen to share an id. The composite IS the "never mix
-- bank and tutor" rule, enforced rather than remembered.

CREATE TABLE IF NOT EXISTS nclex_item_response_stats (
  item_source TEXT        NOT NULL,
  item_id     TEXT        NOT NULL,
  n_students  INTEGER     NOT NULL DEFAULT 0,
  n_full      INTEGER     NOT NULL DEFAULT 0,
  n_partial   INTEGER     NOT NULL DEFAULT 0,
  n_zero      INTEGER     NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (item_source, item_id),

  CONSTRAINT nclex_item_response_stats_source_ck
    CHECK (item_source IN ('BANK', 'TUTOR')),

  -- The invariant that makes a miscounted refresh fail LOUDLY instead of
  -- quietly showing wrong percentages to students. Nobody watches a
  -- nightly job; this watches it.
  CONSTRAINT nclex_item_response_stats_parts_ck
    CHECK (n_full + n_partial + n_zero = n_students),

  CONSTRAINT nclex_item_response_stats_nonneg_ck
    CHECK (n_students >= 0 AND n_full >= 0 AND n_partial >= 0 AND n_zero >= 0)
);

COMMENT ON TABLE nclex_item_response_stats IS
  'How students have answered each question: one row per (item_source, '
  'item_id), each student counted once on their first submitted answer. '
  'Rebuilt nightly from nclex_attempt_answers, so nothing is lost if it '
  'is cleared. Students read it only through nclex_item_stats_for_attempt '
  '(threshold-gated); tutors and curators read the table directly.';

COMMENT ON COLUMN nclex_item_response_stats.n_students IS
  'Distinct students who have SUBMITTED an answer. Skips are not counted '
  'as an encounter at all — a skipped question tells us nothing about how '
  'it is answered.';


-- ── 2. RLS — two audiences, two predicates ───────────────────────────
-- Students are absent from this list on purpose. They reach the numbers
-- only through the function in section 4, which enforces the threshold in
-- SQL so the figures it hides never cross the wire. A policy here would
-- expose the raw counts for every question including n = 1.

ALTER TABLE nclex_item_response_stats ENABLE ROW LEVEL SECURITY;

-- Curators: the bank they own.
DROP POLICY IF EXISTS nclex_item_response_stats_curator ON nclex_item_response_stats;
CREATE POLICY nclex_item_response_stats_curator
  ON nclex_item_response_stats FOR SELECT
  USING (item_source = 'BANK' AND nclex_user_has_permission('BANK_CURATE'));

-- Tutors: their own questions, mirroring nclex_tutor_questions_tutor_own.
-- No threshold here — see the header. A tutor is looking at their own
-- students, which is their job, and the fraction is shown as a fraction.
DROP POLICY IF EXISTS nclex_item_response_stats_tutor_own ON nclex_item_response_stats;
CREATE POLICY nclex_item_response_stats_tutor_own
  ON nclex_item_response_stats FOR SELECT
  USING (
    item_source = 'TUTOR'
    AND EXISTS (
      SELECT 1 FROM nclex_tutor_questions q
      WHERE q.item_id = nclex_item_response_stats.item_id
        AND q.tutor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS nclex_item_response_stats_superadmin ON nclex_item_response_stats;
CREATE POLICY nclex_item_response_stats_superadmin
  ON nclex_item_response_stats FOR SELECT
  USING (nclex_user_has_role('SUPER_ADMIN'));


-- ── 3. the refresh ───────────────────────────────────────────────────
-- One statement. A full recompute rather than an increment: it is cheap
-- at any scale we will see, it is idempotent, and it means turning the
-- feature off loses nothing — the next run rebuilds everything from the
-- answers themselves.
--
-- FIRST SUBMITTED ANSWER PER STUDENT. DISTINCT ON does the deduplication
-- in one clause rather than as a rule three call sites have to remember.
-- ⚠ submitted_at is NULL on some rows (10 on dev), so NULLS LAST keeps
-- them in the running instead of dropping them, and attempt_item_id
-- breaks ties so the result is deterministic across runs.
--
-- ⚠ THE VERDICT BOUNDARIES MIRROR lib/scoring/verdict.ts EXACTLY. If they
-- drift, a question reads "Partial credit" in the strip while being
-- counted as full credit in the figure beside it. Pinned by a test.

CREATE OR REPLACE FUNCTION nclex_refresh_item_response_stats()
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_enabled TEXT;
  v_rows    INTEGER;
BEGIN
  SELECT value INTO v_enabled FROM nclex_config WHERE key = 'item_stats_enabled';
  IF v_enabled = 'false' THEN
    RETURN 0;
  END IF;

  INSERT INTO nclex_item_response_stats AS s
        (item_source, item_id, n_students, n_full, n_partial, n_zero, computed_at)
  SELECT f.item_source,
         f.item_id,
         count(*)::INTEGER,
         count(*) FILTER (WHERE f.marks > 0 AND f.score >= f.marks)::INTEGER,
         count(*) FILTER (WHERE f.marks > 0 AND f.score > 0 AND f.score < f.marks)::INTEGER,
         -- Everything else: a zero score, and the broken-rubric case
         -- (marks <= 0) that verdict.ts also refuses to call correct.
         count(*) FILTER (WHERE f.score <= 0 OR f.marks <= 0)::INTEGER,
         now()
  FROM (
    SELECT DISTINCT ON (a.student_id, ai.item_source, ai.item_id)
           ai.item_source,
           ai.item_id,
           COALESCE(aa.score_awarded, 0) AS score,
           ai.marks_snapshot             AS marks
    FROM nclex_attempt_answers aa
    JOIN nclex_attempt_items   ai ON ai.attempt_item_id = aa.attempt_item_id
    JOIN nclex_attempts        a  ON a.attempt_id       = ai.attempt_id
    WHERE aa.submission_status IN ('SUBMITTED', 'AUTO_SUBMITTED')
      AND ai.item_id IS NOT NULL
      AND a.student_id IS NOT NULL
    ORDER BY a.student_id, ai.item_source, ai.item_id,
             aa.submitted_at ASC NULLS LAST, aa.attempt_item_id
  ) f
  GROUP BY f.item_source, f.item_id
  ON CONFLICT (item_source, item_id) DO UPDATE
    SET n_students  = EXCLUDED.n_students,
        n_full      = EXCLUDED.n_full,
        n_partial   = EXCLUDED.n_partial,
        n_zero      = EXCLUDED.n_zero,
        computed_at = EXCLUDED.computed_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE EXECUTE ON FUNCTION nclex_refresh_item_response_stats() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION nclex_refresh_item_response_stats() IS
  'Rebuilds nclex_item_response_stats from every submitted answer. Run '
  'nightly by pg_cron. Returns rows written, or 0 when item_stats_enabled '
  'is false. Granted to nobody — cron runs as the table owner.';


-- ── 4. the student read — the only door, and it is gated ─────────────
-- Takes an ATTEMPT, not a list of item ids, for two reasons: one round
-- trip for a whole sitting, and a caller cannot probe arbitrary questions
-- — only the ones they were actually served.
--
-- ⚠ THE THRESHOLD IS ENFORCED HERE, IN SQL, NOT IN THE COMPONENT.
-- Returning n = 1 and letting the UI hide it would leave the number in
-- the response for anyone who opens the network tab — and on a question
-- only one person has ever answered, that number IS that person's result.
-- Same rule the case bank settled: what we are hiding must not be in the
-- payload. 30 matches lib/calibration/fit.ts's DEFAULT_MIN_RESPONSES —
-- one answer to "how many responses before we believe this", not two.

CREATE OR REPLACE FUNCTION nclex_item_stats_for_attempt(p_attempt_id UUID)
RETURNS TABLE (
  attempt_item_id UUID,
  n_students      INTEGER,
  n_full          INTEGER,
  n_partial       INTEGER,
  n_zero          INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student UUID := auth.uid();
  v_owner   UUID;
  v_enabled TEXT;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT value INTO v_enabled FROM nclex_config WHERE key = 'item_stats_enabled';
  IF v_enabled = 'false' THEN
    RETURN;
  END IF;

  SELECT a.student_id INTO v_owner
  FROM nclex_attempts a WHERE a.attempt_id = p_attempt_id;

  -- One message for "no such attempt" and "not yours", so a caller cannot
  -- probe whether an attempt id exists. Mirrors
  -- nclex_set_attempt_item_flag.
  IF v_owner IS NULL OR v_owner <> v_student THEN
    RAISE EXCEPTION 'sitting not found';
  END IF;

  RETURN QUERY
  SELECT ai.attempt_item_id,
         st.n_students,
         st.n_full,
         st.n_partial,
         st.n_zero
  FROM nclex_attempt_items ai
  JOIN nclex_item_response_stats st
    ON st.item_source = ai.item_source
   AND st.item_id     = ai.item_id
  WHERE ai.attempt_id = p_attempt_id
    AND st.n_students >= 30;
END;
$$;

REVOKE EXECUTE ON FUNCTION nclex_item_stats_for_attempt(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION nclex_item_stats_for_attempt(UUID) TO authenticated;


-- ── 5. the switch ────────────────────────────────────────────────────
-- Gates BOTH the refresh and the student read, unlike the other two
-- scheduled-job switches which only stop a job. Stopping this job alone
-- would freeze the last numbers on screen rather than remove them — the
-- wrong outcome for the failure most likely to make an admin reach for
-- it ("these look wrong"). Off means not computed and not shown.

INSERT INTO nclex_config (key, value, description) VALUES
  ('item_stats_enabled', 'true',
   'Count how students have answered each question and show it in review. Off = not recomputed and not shown.')
ON CONFLICT (key) DO NOTHING;


-- ── 6. the schedule ──────────────────────────────────────────────────
-- Same shape as the enrolment sweep (20260608120000). The named overload
-- upserts by job name, so re-running this migration just refreshes it.
-- 03:00 rather than 02:00 because the enrolment sweep holds that slot and
-- there is no reason for them to contend.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'nclex-item-stats-nightly',
  '0 3 * * *',
  $cron$ SELECT public.nclex_refresh_item_response_stats(); $cron$
);
