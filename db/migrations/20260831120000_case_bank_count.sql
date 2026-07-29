-- ─────────────────────────────────────────────────────────────────────
-- Case Study bank — a count for the dashboard doorway
-- ─────────────────────────────────────────────────────────────────────
-- The bank dashboard's "Where to next" card replaces the Journey Tracker
-- door (an unbuilt pillar, removed 2026-07-30) with one for the case
-- bank. That card's governing rule is that a door may only say something
-- we can actually count — so the door needs a real figure, and the
-- honest one is "how many cases can this student sit right now".
--
-- Why not just call nclex_case_bank_list() and count the rows: it
-- returns every case with its scenario text, ~100KB on dev. That is a
-- lot of payload to drag onto the dashboard for a single integer.
--
-- It reads the SAME eligibility helper the page does, so the number on
-- the dashboard and the "Ready to sit" heading on the page cannot
-- disagree — the one-gateway property the rest of this surface has.
--
-- ⓘ Auth-only, deliberately — unlike nclex_case_bank_list, which carries
-- the bank-entitlement check because it returns scenario TEXT. This
-- returns a single integer, which is not protected content (the public
-- site could advertise it), and it sits in the same Promise.all as
-- nclex_count_eligible_items, which is also auth-only. Making it throw
-- for an unentitled user would take the whole dashboard down with it.

CREATE OR REPLACE FUNCTION nclex_case_bank_count()
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student UUID := auth.uid();
  v_n       INTEGER;
BEGIN
  IF v_student IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT COUNT(*) INTO v_n
  FROM _nclex_case_bank_pool(v_student) p
  WHERE p.locked = FALSE;

  RETURN COALESCE(v_n, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION nclex_case_bank_count() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION nclex_case_bank_count() TO authenticated;
