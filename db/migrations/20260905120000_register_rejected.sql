-- mynclex/db/migrations/20260905120000_register_rejected.sql
--
-- Slice 2d, step 2 — one new event type: REGISTER_REJECTED.
--
-- ⭐ WHY THIS ONE COSTS A MIGRATION WHEN THE OTHERS DID NOT. 2a loaded the
-- CHECK constraint with every type its later slices would need (CODE_* for
-- slice 3, GOOGLE_FIRST_SIGNIN for slice 5), which is why those slices ship
-- without touching the database. This type was not foreseen: it comes from
-- a gap Sam found on 2026-08-06 by asking what happens when someone signs
-- up with an address that already exists.
--
-- ⭐ THE GAP. /register is the ONE public auth surface that answers the
-- question the other two refuse — a known address returns Supabase's "User
-- already registered", and that message STAYS by decision (a returning
-- student who forgot she signed up gets an answer instead of a dead end).
-- But a refused signup returns before logAuthEvent ever runs, so it writes
-- NO ROW AT ALL. /register was the only auth surface that left no trace on
-- failure — which means someone probing it for valid addresses was
-- invisible in the very logbook 2a built to make attacks visible.
--
-- The message is not the risk on its own. The absence of both a limit and
-- a record was. Step 1 gave /register Turnstile; this gives it the record.
--
-- Covers two rejections, told apart by `reason`:
--   'turnstile:<code>'          — refused before Supabase was asked at all
--   'signup_failed: <message>'  — Supabase said no, "User already
--                                 registered" among them
--
-- ⓘ Type only. No column, no index, no policy change: the row shape,
-- append-only RLS and 90-day retention sweep from 20260904120000 all apply
-- unchanged, and `reason` is deliberately free text there so a new failure
-- mode never needs a migration again.

ALTER TABLE nclex_auth_events
  DROP CONSTRAINT IF EXISTS nclex_auth_events_type_ck;

ALTER TABLE nclex_auth_events
  ADD CONSTRAINT nclex_auth_events_type_ck CHECK (event_type IN (
    'LOGIN_OK', 'LOGIN_FAIL', 'LOGIN_BLOCKED',
    'REGISTERED', 'REGISTER_REJECTED',
    'RESET_REQUESTED', 'RESET_COMPLETED', 'RESET_BLOCKED',
    'CODE_REQUESTED', 'CODE_LOGIN_OK', 'CODE_LOGIN_FAIL',
    'INVITE_ACCEPTED', 'GOOGLE_FIRST_SIGNIN'
  ));
