-- Fix: creating a tutor question failed with a primary-key violation on
-- nclex_tutor_questions.item_id.
--
-- nextItemId() in lib/bank/actions/save-question.ts builds the next id
-- (NCLEX_TUT_<TYPE>_NNNNN) by selecting existing ids with that prefix and
-- taking max-digit-suffix + 1. That SELECT runs through the logged-in tutor's
-- client, and the only non-superadmin RLS policy on the table is
-- nclex_tutor_questions_tutor_own = (tutor_id = auth.uid()). So the counter
-- only sees the CALLER's own rows. Any tutor who doesn't personally hold the
-- highest number for a type regenerates an id another tutor already owns ->
-- pkey collision; a tutor with zero questions always generates _00001 (taken
-- for every type) and can create nothing.
--
-- Fix: compute the next id with a SECURITY DEFINER function that scans the
-- WHOLE table (runs as the function owner, bypassing the tutor RLS scope).
-- The admin/bank surface (nclex_bank_items) is unaffected -- curators can read
-- all bank items -- so it keeps its direct client-side scan.
--
-- Known limitation (out of scope, matches the admin path): a tiny race if two
-- tutors create the same type at the same instant could hand out the same
-- number. A per-type sequence or allocate-and-insert-in-one-call would close
-- it later.

CREATE OR REPLACE FUNCTION nclex_next_tutor_item_id(p_prefix text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_prefix || lpad(
    (
      COALESCE(
        max(
          CASE
            WHEN substring(item_id FROM length(p_prefix) + 1) ~ '^\d+$'
            THEN substring(item_id FROM length(p_prefix) + 1)::int
          END
        ),
        0
      ) + 1
    )::text,
    5, '0'
  )
  FROM nclex_tutor_questions
  -- Exact prefix match: left()/= avoids LIKE treating the '_' in the prefix as
  -- a single-char wildcard.
  WHERE left(item_id, length(p_prefix)) = p_prefix;
$$;

REVOKE EXECUTE ON FUNCTION nclex_next_tutor_item_id(text) FROM public;
GRANT  EXECUTE ON FUNCTION nclex_next_tutor_item_id(text) TO authenticated;
