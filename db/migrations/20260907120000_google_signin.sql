-- mynclex/db/migrations/20260907120000_google_signin.sql
--
-- Slice 5a + 5b — Google is a SIGN-IN method, not a sign-up method.
-- Two things in one migration: the gate that enforces that, and the two
-- event types that record what it did.
--
-- ⭐⭐ THE DECISION THIS ENFORCES (settled 2026-08-09, Sam's framing).
-- An account with no subscription and no enrolment can do nothing here, so
-- manufacturing empty accounts serves nobody. Google verifies WHO SHE IS;
-- we then verify SHE HAS AN ACCOUNT WITH US. Known address → in. Unknown
-- address → turned away, with nothing written anywhere.
--
-- ⭐ WHY A HOOK AND NOT APPLICATION CODE — the constraint that decides it.
-- `signInWithOtp` takes `shouldCreateUser: false`, which is the line
-- holding email-code login to sign-in-only. `signInWithOAuth` HAS NO SUCH
-- OPTION (verified against the installed @supabase/auth-js: its options are
-- exactly redirectTo, scopes, queryParams, skipBrowserRedirect). Supabase
-- therefore writes the auth.users row BEFORE any code of ours runs, and an
-- /auth/callback that discovers the problem is already too late — its only
-- move would be to delete a row it just caused, which is the same
-- half-built-account trap wearing a different hat. This hook runs BEFORE
-- the row is written, so there is nothing to undo.
--
-- ⭐ WHAT THE ORPHAN WOULD HAVE BROKEN, checked rather than assumed. Both
-- account-creating paths look the person up in nclex_users (the PROFILE
-- table) and then create in auth.users:
--   lib/enrolments/actions.ts  — tutor enrols a student
--   lib/payments/activate.ts   — pay-first guest activation
-- A Google stranger leaves a row in auth.users with no profile, so both
-- conclude "new person", both call inviteUserByEmail, and both collide with
-- auth.users' unique index on email (users_email_partial_key, UNIQUE(email)
-- WHERE is_sso_user = false). The tutor cannot enrol her; worse, the payment
-- path returns "Payment recorded, but we could not send the setup email" —
-- SHE HAS PAID AND CANNOT GET IN. /register refuses her too ("already
-- registered", the message app/register/actions.ts already knows by name).
-- She would never learn why: she clicked a button weeks earlier and was told
-- "no account".
--
-- ⭐ WHY THE FUNCTION LOOKS UP NOTHING, which is the whole elegance here.
-- Supabase links a new OAuth identity to an existing user with the same
-- email automatically. So a CREATION arriving via Google is itself proof
-- that no account exists — if one did, linking would have happened and
-- nothing would be created. The rule needs no query: provider = 'google'
-- → refuse.
--
-- ⚠ AND THAT IS WHY THIS CANNOT ACCIDENTALLY SHUT THE OTHER DOORS.
-- The hook is consulted for EVERY user creation — /register, tutor invites,
-- pay-first activation. Those all arrive with provider 'email' and fall
-- straight through to the allow at the bottom. The narrowness is structural,
-- not a condition we hand-wrote carefully and hope is right.

-- ---------------------------------------------------------------------------
-- 1. The gate
-- ---------------------------------------------------------------------------

-- ⓘ `set search_path = ''` because this function resolves nothing — it reads
-- only its jsonb argument. An empty path is the safest form and keeps the
-- Supabase linter's mutable-search_path advisory quiet.
--
-- ⓘ NOT SECURITY DEFINER, deliberately. It touches no table, so it needs no
-- borrowed authority; supabase_auth_admin's own rights are enough.
CREATE OR REPLACE FUNCTION public.hook_reject_google_signups(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  provider text;
BEGIN
  provider := event -> 'user' -> 'app_metadata' ->> 'provider';

  IF provider = 'google' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'No account found for this Google address.',
        'http_code', 403
      )
    );
  END IF;

  -- Everything that is not Google. Allow.
  RETURN '{}'::jsonb;
END;
$$;

-- The hook is called by GoTrue as supabase_auth_admin and by nobody else.
-- Revoking the public grant matters: left in place, any signed-in student
-- could call it directly. It would tell her nothing she doesn't know, but a
-- function that decides who may hold an account should not be on the menu.
GRANT EXECUTE ON FUNCTION public.hook_reject_google_signups TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.hook_reject_google_signups FROM authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- 2. The vocabulary
-- ---------------------------------------------------------------------------

-- ⭐ GOOGLE_FIRST_SIGNIN IS RETIRED, NOT REPURPOSED — Sam's call, and the
-- right one. Under sign-in-only there is no such thing as a first sign-in
-- that creates an account, so the name would have survived describing
-- something it no longer meant: the worst kind of column value, because it
-- reads correctly and is false. Safe to remove because it was pre-loaded
-- into the constraint by 20260904120000 in anticipation of this slice and
-- NEVER WRITTEN — zero rows on dev and zero on prod, both checked
-- 2026-08-09 before this migration was written. If that were ever untrue
-- the ADD CONSTRAINT below would fail loudly, which is the correct outcome.
--
-- ⭐⭐ TWO TYPES, NOT ONE — the fourth sighting of a shape that has cost two
-- migrations already. 20260905120000 and 20260906120000 both exist because
-- an earlier slice named the success and forgot the refusal: 2a foresaw
-- every type describing what the STUDENT did and missed the one describing
-- what WE did. Turning a stranger away is the single most common thing this
-- feature will do. It is not being shipped nameless.
--
-- The pattern is the one both other doors already use — success, and the
-- refusal that must never be counted as a failure:
--   LOGIN_OK       / LOGIN_FAIL      / LOGIN_BLOCKED
--   CODE_LOGIN_OK  / CODE_LOGIN_FAIL / CODE_BLOCKED
--   GOOGLE_LOGIN_OK                  / GOOGLE_BLOCKED
--
-- ⓘ No GOOGLE_LOGIN_FAIL. There is no wrong answer to give at this door —
-- Google decides whether she is who she says, and if it says no we never
-- hear from her. The only two outcomes that reach us are "in" and "turned
-- away".
--
-- ⓘ `reason` carries the rest, exactly as LOGIN_BLOCKED serves three
-- meanings through one type:
--   'no_account'  — refused by the hook above; she has no account here
-- A second refusal mode later is a new string, not a new migration.
--
-- ⚠ GOOGLE_BLOCKED IS WRITTEN BY THE ROUTE HANDLER, NOT BY THE HOOK, and
-- the reason is not stylistic. The hook refuses by returning an error, which
-- aborts the signup — a log row inserted from inside it could be rolled back
-- with the transaction it was meant to outlive. The refusal is recorded in
-- TypeScript at /auth/callback, where every other auth event in this table
-- is already written (lib/auth/events.ts) and where the row is safe.

ALTER TABLE nclex_auth_events
  DROP CONSTRAINT IF EXISTS nclex_auth_events_type_ck;

ALTER TABLE nclex_auth_events
  ADD CONSTRAINT nclex_auth_events_type_ck CHECK (event_type IN (
    'LOGIN_OK', 'LOGIN_FAIL', 'LOGIN_BLOCKED',
    'REGISTERED', 'REGISTER_REJECTED',
    'RESET_REQUESTED', 'RESET_COMPLETED', 'RESET_BLOCKED',
    'CODE_REQUESTED', 'CODE_LOGIN_OK', 'CODE_LOGIN_FAIL', 'CODE_BLOCKED',
    'INVITE_ACCEPTED',
    'GOOGLE_LOGIN_OK', 'GOOGLE_BLOCKED'
  ));
