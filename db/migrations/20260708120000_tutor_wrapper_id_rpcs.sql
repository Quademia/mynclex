-- Fix: creating a tutor question / case study / trend dataset failed with a
-- primary-key violation on the generated id.
--
-- The id generators in lib/bank/actions/save-question.ts (nextItemId),
-- lib/bank/wrappers/case-study/actions.ts (nextCaseId) and
-- lib/bank/wrappers/trend/actions.ts (nextTrendId) all build the next id
-- (NCLEX_TUT_<...>_NNNNN) by selecting existing ids with that prefix and
-- taking max-digit-suffix + 1. Those SELECTs run through the logged-in tutor's
-- client, and each tutor table's only non-superadmin RLS policy is
-- *_tutor_own = (tutor_id = auth.uid()):
--   nclex_tutor_questions, nclex_tutor_case_studies, nclex_tutor_trend_datasets
-- So each counter only sees the CALLER's own rows. Any tutor who doesn't
-- personally hold the highest number regenerates an id another tutor already
-- owns -> pkey collision; a tutor with zero rows always generates _00001
-- (taken) and can create nothing.
--
-- Fix: compute the next id with SECURITY DEFINER functions that scan the WHOLE
-- table (run as the function owner, bypassing the tutor RLS scope;
-- relforcerowsecurity is false on all three). The admin/bank surfaces
-- (nclex_bank_items / nclex_case_studies / nclex_trend_datasets) are unaffected
-- -- curators can read all of those -- so they keep their direct client scans.
--
-- Known limitation (out of scope, matches the admin path): a tiny race if two
-- tutors create the same prefix at the same instant could hand out the same
-- number. A per-type sequence or allocate-and-insert-in-one-call would close
-- it later.

-- Questions: nclex_tutor_questions.item_id
CREATE OR REPLACE FUNCTION nclex_next_tutor_item_id(p_prefix text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_prefix || lpad(
    (COALESCE(max(
       CASE WHEN substring(item_id FROM length(p_prefix) + 1) ~ '^\d+$'
            THEN substring(item_id FROM length(p_prefix) + 1)::int END
     ), 0) + 1)::text, 5, '0')
  FROM nclex_tutor_questions
  WHERE left(item_id, length(p_prefix)) = p_prefix;
$$;

-- Case studies: nclex_tutor_case_studies.case_id
CREATE OR REPLACE FUNCTION nclex_next_tutor_case_id(p_prefix text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_prefix || lpad(
    (COALESCE(max(
       CASE WHEN substring(case_id FROM length(p_prefix) + 1) ~ '^\d+$'
            THEN substring(case_id FROM length(p_prefix) + 1)::int END
     ), 0) + 1)::text, 5, '0')
  FROM nclex_tutor_case_studies
  WHERE left(case_id, length(p_prefix)) = p_prefix;
$$;

-- Trend datasets: nclex_tutor_trend_datasets.trend_id
CREATE OR REPLACE FUNCTION nclex_next_tutor_trend_id(p_prefix text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_prefix || lpad(
    (COALESCE(max(
       CASE WHEN substring(trend_id FROM length(p_prefix) + 1) ~ '^\d+$'
            THEN substring(trend_id FROM length(p_prefix) + 1)::int END
     ), 0) + 1)::text, 5, '0')
  FROM nclex_tutor_trend_datasets
  WHERE left(trend_id, length(p_prefix)) = p_prefix;
$$;

REVOKE EXECUTE ON FUNCTION nclex_next_tutor_item_id(text)  FROM public;
REVOKE EXECUTE ON FUNCTION nclex_next_tutor_case_id(text)  FROM public;
REVOKE EXECUTE ON FUNCTION nclex_next_tutor_trend_id(text) FROM public;
GRANT  EXECUTE ON FUNCTION nclex_next_tutor_item_id(text)  TO authenticated;
GRANT  EXECUTE ON FUNCTION nclex_next_tutor_case_id(text)  TO authenticated;
GRANT  EXECUTE ON FUNCTION nclex_next_tutor_trend_id(text) TO authenticated;
