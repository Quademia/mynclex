-- mynclex/db/migrations/20260906120000_code_blocked.sql
--
-- Slice 3a — one new event type: CODE_BLOCKED.
--
-- ⭐ THE PLAN SAID SLICE 3 NEEDED NO MIGRATION, AND THE PLAN WAS WRONG.
-- 2a loaded the CHECK constraint with the types it could foresee — CODE_*
-- for this slice, GOOGLE_FIRST_SIGNIN for slice 5 — so the doc recorded
-- slice 3 as free. What it foresaw was the three types describing what the
-- student DID (requested a code, signed in, got it wrong). It did not
-- foresee the type describing what WE did: refuse her before asking.
--
-- ⭐ WHY A BLOCK CANNOT BE A FAIL, restated because this is the third time
-- the arc has needed the same rule and the reasoning is the whole point.
-- 2c's thresholds count failures. If a refusal were written as a failure it
-- would be counted by the very rule that produced it — one trip would feed
-- the next, the block would extend itself, and a student would be held out
-- by her own lockouts rather than by anything she did. Every flow in this
-- table therefore separates the two: LOGIN_FAIL / LOGIN_BLOCKED,
-- RESET_REQUESTED / RESET_BLOCKED, and now CODE_LOGIN_FAIL / CODE_BLOCKED.
--
-- ⭐ ONE TYPE, NOT TWO, AND THE REASON COLUMN CARRIES THE REST. Slice 3 has
-- two doors that can refuse — too many codes requested, and too many wrong
-- codes entered — which looks like two types until you notice LOGIN_BLOCKED
-- already serves a Turnstile refusal and two different thresholds through
-- one type. `reason` is free text on purpose (see 20260905120000), so:
--   'threshold_request_60min'  — 3 code requests in an hour, per address
--   'threshold_verify_10min'   — 5 wrong codes in ten minutes, per address
--   'turnstile:<code>'         — refused before Supabase was asked
-- A fourth refusal mode later needs a new string, not a new migration.
--
-- ⓘ Type only. No column, no index, no policy change: the row shape, the
-- append-only RLS (one SELECT policy and no insert/update/delete policy for
-- anybody — writes go over the top via service role) and the 90-day
-- retention sweep from 20260904120000 all apply to these rows unchanged.

ALTER TABLE nclex_auth_events
  DROP CONSTRAINT IF EXISTS nclex_auth_events_type_ck;

ALTER TABLE nclex_auth_events
  ADD CONSTRAINT nclex_auth_events_type_ck CHECK (event_type IN (
    'LOGIN_OK', 'LOGIN_FAIL', 'LOGIN_BLOCKED',
    'REGISTERED', 'REGISTER_REJECTED',
    'RESET_REQUESTED', 'RESET_COMPLETED', 'RESET_BLOCKED',
    'CODE_REQUESTED', 'CODE_LOGIN_OK', 'CODE_LOGIN_FAIL', 'CODE_BLOCKED',
    'INVITE_ACCEPTED', 'GOOGLE_FIRST_SIGNIN'
  ));
