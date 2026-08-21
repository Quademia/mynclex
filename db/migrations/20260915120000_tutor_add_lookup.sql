-- mynclex/db/migrations/20260915120000_tutor_add_lookup.sql
--
-- Tutor onboarding — sub-slice 1c: the two lookups the "Add tutor" flow
-- runs on. Plan: docs/product-plan/tutor-onboarding.md §11.1c.
--
-- ⚠ WHY THESE ARE FUNCTIONS AND NOT QUERIES. nclex_users_self_read is
--     USING (id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'))
-- so ONLY A SUPER_ADMIN CAN READ ANOTHER USER'S ROW. An admin holding
-- TUTORS_MANAGE can neither search for a person nor check whether an
-- email is taken — both halves of the add flow — through the authed
-- client. It appears to work today only because Sam is the sole
-- SUPER_ADMIN and nclex_admin_permissions is empty, so the flow would
-- quietly depend on one person's role and break the first time it is
-- delegated. SECURITY DEFINER lifts exactly that, and nothing else.
--
-- ⭐ NARROW BY CONSTRUCTION, NOT BY CONVENTION. An "is this email taken?"
-- endpoint is an account-enumeration vector, so neither function can be
-- turned into a directory:
--   • the search REFUSES a fragment under 2 characters and returns at
--     most 10 rows — there is no query that lists everyone;
--   • the email check takes an EXACT address and answers about that one
--     address only. You must already know the address to learn anything.
-- /admin/users, the actual user directory, remains unbuilt and is not
-- what these are.
--
-- ⚠ BOTH RE-CHECK THE PERMISSION INSIDE THE FUNCTION. The calling page is
-- gated too, but a SECURITY DEFINER function that trusts its caller is a
-- hole: it runs as the definer for ANYONE who can execute it, and
-- `authenticated` includes every signed-in student. The house rule is to
-- gate at every layer; here that rule is load-bearing rather than
-- belt-and-braces.
--
-- ⓘ nclex_tutor_email_check is used by the NEW-USER path (1c-ii). It
-- ships here because both lookups are one concern and one migration; the
-- search alone is what 1c-i consumes.


-- ── 1. search by fragment (the "existing user" path) ─────────────────
-- Returns whoever matches, INCLUDING people who are already tutors, with
-- is_tutor flagged so the UI can show them disabled rather than hide
-- them. Hiding was the handoff's suggestion and was argued down: an
-- admin who searches for someone they know exists and sees nothing reads
-- that as a bug, not as "they are already a tutor".

CREATE OR REPLACE FUNCTION nclex_tutor_search(p_fragment TEXT)
RETURNS TABLE (
  user_id   UUID,
  name      TEXT,
  email     TEXT,
  roles     TEXT[],
  is_tutor  BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  needle TEXT;
BEGIN
  IF NOT nclex_user_has_permission('TUTORS_MANAGE') THEN
    RAISE EXCEPTION 'nclex_tutor_search: TUTORS_MANAGE required';
  END IF;

  needle := btrim(COALESCE(p_fragment, ''));

  -- Under two characters this returns NOTHING — not "everyone". That is
  -- the whole enumeration guard, and it lives here rather than in the
  -- client so it cannot be skipped by calling the RPC directly.
  IF length(needle) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.name,
    u.email,
    COALESCE(
      ARRAY(SELECT r.role FROM nclex_user_roles r WHERE r.user_id = u.id ORDER BY r.role),
      '{}'::TEXT[]
    ),
    EXISTS (SELECT 1 FROM nclex_tutors t WHERE t.user_id = u.id)
  FROM nclex_users u
  WHERE u.name ILIKE '%' || needle || '%'
     OR u.email ILIKE '%' || needle || '%'
  ORDER BY u.name
  LIMIT 10;
END;
$fn$;

GRANT EXECUTE ON FUNCTION nclex_tutor_search(TEXT) TO authenticated;


-- ── 2. exact-email existence (the "new user" path, 1c-ii) ────────────
-- Three answers, because the UI needs three different next steps:
--   'none'  → nothing exists; invite them (or, until slice 3, tell the
--             admin to have them register)
--   'user'  → an account exists but no tutor record; offer to PROMOTE
--   'tutor' → already a tutor; offer to open their record
-- The name comes back so the UI can say WHO, which is what makes the
-- escape hatch usable rather than merely correct.

CREATE OR REPLACE FUNCTION nclex_tutor_email_check(p_email TEXT)
RETURNS TABLE (
  verdict   TEXT,
  user_id   UUID,
  name      TEXT,
  roles     TEXT[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  addr TEXT;
  -- ⚠ NOT named `found`: plpgsql has a special FOUND variable, and a
  -- declaration of that name shadows it, so `IF NOT FOUND` compares a
  -- RECORD against a boolean and the function throws on EVERY call.
  -- Caught 2026-08-21 by exercising the RPC; tsc and lint cannot see it.
  hit RECORD;
BEGIN
  IF NOT nclex_user_has_permission('TUTORS_MANAGE') THEN
    RAISE EXCEPTION 'nclex_tutor_email_check: TUTORS_MANAGE required';
  END IF;

  addr := lower(btrim(COALESCE(p_email, '')));

  -- No partial matching anywhere: an exact address, or nothing. A
  -- prefix search here would be the directory this must never become.
  IF addr = '' OR addr NOT LIKE '%@%' THEN
    RETURN;
  END IF;

  SELECT u.id, u.name INTO hit
    FROM nclex_users u
   WHERE lower(u.email) = addr
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'none'::TEXT, NULL::UUID, NULL::TEXT, '{}'::TEXT[];
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    CASE WHEN EXISTS (SELECT 1 FROM nclex_tutors t WHERE t.user_id = hit.id)
         THEN 'tutor' ELSE 'user' END,
    hit.id,
    hit.name,
    COALESCE(
      ARRAY(SELECT r.role FROM nclex_user_roles r WHERE r.user_id = hit.id ORDER BY r.role),
      '{}'::TEXT[]
    );
END;
$fn$;

GRANT EXECUTE ON FUNCTION nclex_tutor_email_check(TEXT) TO authenticated;
