-- ─────────────────────────────────────────────────────────────────────
-- nclex_auth_events — the auth logbook
-- ─────────────────────────────────────────────────────────────────────
-- Build-order item 2, slice 2a (docs/product-plan/domain-and-identity.md
-- → Build order). The first CODE slice of the identity arc.
--
-- WHY THIS SHIPS BEFORE THE FLOW IT SERVES.
-- Slice 2b builds forgot-password; this table is written first because
-- logs cannot be captured retroactively. The table has to exist before
-- the support case does — the first student to say "I never got the
-- email" is the first person this answers, and if the table arrives with
-- her, it is empty for exactly the request she is asking about.
--
-- WHAT IT IS FOR, IN ORDER OF WEIGHT:
--   1. Support. One timeline per student, read in order.
--   2. Enforcement (slice 2c). One count-query at the top of the login
--      and reset actions — gamma's graduated thresholds, ported, but run
--      server-side where a caller cannot step around them.
--   3. Evidence for a decision not yet made. Every LOGIN_OK carries a
--      device label, so account sharing becomes VISIBLE the moment this
--      ships, with no enforcement built at all — the concurrent-session
--      limit then gets picked from data instead of guessed in advance
--      (doc → "Sequencing: capture first, decide with evidence").
--
-- WHAT IT IS NOT. Not an intrusion detector, and it must not later be
-- mistaken for one. A script trying one password across ten thousand
-- addresses touches ten thousand counters that each read 1, so no
-- per-email threshold can ever fire on it. Cloudflare Turnstile (slice
-- 2d) is the answer to that attack; this table is a support tool with a
-- narrow enforcement job. Worse, an attacker calling Supabase's auth
-- endpoint directly with the public anon key never reaches our server
-- actions at all, so that traffic writes no row here — the honest scope
-- of this table is "what came through our own forms".
--
-- GAMMA'S TWO TABLES BECOME THIS ONE. Gamma split auth_events (login
-- watchdog) from reset_requests (reset watchdog) because each carried
-- its own enforcement RPCs. Kill the RPCs and the reason for two tables
-- disappears: a reset request is just another event. One timeline means
-- support reads the whole story in order instead of interleaving two
-- tables, and "CODE_REQUESTED with no CODE_LOGIN_OK after it" reads the
-- same way as "RESET_REQUESTED with no RESET_COMPLETED" — check spam.


-- ── 1. the table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nclex_auth_events (
  event_id     BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type   TEXT        NOT NULL,

  -- The address TRIED, lowercased by the caller. Deliberately NOT a
  -- foreign key and deliberately kept even when it matches no account:
  -- "she asked for her Yahoo, her account is under her Gmail" is the #1
  -- support case, and it is only answerable if we store addresses we do
  -- not recognise.
  email        TEXT,

  -- Set when the attempt resolved to a real account. NOT a foreign key
  -- ON PURPOSE: an FK would either block the delete of a user or cascade
  -- their history away, and an audit log that disappears with its subject
  -- is not an audit log. The register rollback path already hard-deletes
  -- auth users (app/register/actions.ts), so this is a live case, not a
  -- hypothetical one.
  user_id      UUID,

  -- Reset events only. The PAGE stays silent about unknown addresses
  -- (anti-enumeration — a form that says "no such account" is a tool for
  -- discovering who has one); the LOG records what the page would not
  -- say. Gamma's idea, kept.
  user_exists  BOOLEAN,

  -- Human-readable, e.g. 'Android · Chrome'. Read from the User-Agent.
  -- ⚠ NOT a fingerprint hash. Gamma's fp_hash/ua_hash existed to enforce
  -- per-device rate limits; we dropped that axis in favour of Turnstile,
  -- so there is nothing left for a hash to do except sit here being
  -- quasi-identifying data at rest.
  device_label TEXT,

  -- Logged, never enforced on — the distinction is the whole decision
  -- (settled 2026-08-06 with Sam). Storing it and blocking on it are two
  -- choices, and they go different ways here: it is the only axis that
  -- can SEE a spray that came through our forms, but Ghanaian mobile
  -- carriers put thousands of subscribers behind a handful of addresses,
  -- so a per-IP threshold could lock out an entire network's worth of
  -- nurses on a busy evening. ⚠ Do not add an IP rule to slice 2c
  -- without re-opening that trade-off.
  ip_address   INET,

  -- Short machine-ish note: 'invalid_credentials', 'threshold_10min',
  -- 'profile_insert_failed'. Free text on purpose — a CHECK here would
  -- make adding a new failure mode a migration.
  reason       TEXT,

  -- ⚠ THE FUTURE TYPES ARE IN THIS LIST ON PURPOSE (agreed with Sam,
  -- 2026-08-06). CODE_* belongs to slice 3, GOOGLE_FIRST_SIGNIN to slice
  -- 5, INVITE_ACCEPTED is written from /welcome today. Naming them now
  -- costs nothing and means those slices need no migration.
  --
  -- *_BLOCKED are distinct types rather than a flag because slice 2c's
  -- rule is that a blocked attempt must NOT count toward the threshold
  -- that blocked it — otherwise the punishment feeds itself and one
  -- tripped limit keeps a student locked out by her own lockouts. As a
  -- separate type, that exclusion is a fact in the data instead of a
  -- rule every counting query has to remember.
  CONSTRAINT nclex_auth_events_type_ck CHECK (event_type IN (
    'LOGIN_OK', 'LOGIN_FAIL', 'LOGIN_BLOCKED',
    'REGISTERED',
    'RESET_REQUESTED', 'RESET_COMPLETED', 'RESET_BLOCKED',
    'CODE_REQUESTED', 'CODE_LOGIN_OK', 'CODE_LOGIN_FAIL',
    'INVITE_ACCEPTED', 'GOOGLE_FIRST_SIGNIN'
  ))
);

COMMENT ON TABLE nclex_auth_events IS
  'Append-only log of authentication attempts: one row per login, '
  'registration, reset or code request. Written from server actions via '
  'the service-role client (a failed login has no session, so an ordinary '
  'client could not write the row). Read by support (admin UI, later '
  'slice) and by the slice-2c thresholds. Never contains passwords.';

COMMENT ON COLUMN nclex_auth_events.email IS
  'The address the caller TYPED, lowercased — not a verified identity. '
  'Kept even when it matches no account, which is the point.';

COMMENT ON COLUMN nclex_auth_events.ip_address IS
  'Recorded for support forensics. NOT used by any rate-limit rule — see '
  'the column comment in the migration before changing that.';


-- ── 2. indexes — one per reader ──────────────────────────────────────
-- Each of the three exists for a named query, not on general principle.

-- Slice 2c: "how many failures for this email in the last 10 minutes?"
-- Partial, because rows without an email (there should be none, but the
-- column is nullable) can never satisfy that predicate.
CREATE INDEX IF NOT EXISTS idx_nclex_auth_events_email_time
  ON nclex_auth_events (email, occurred_at DESC)
  WHERE email IS NOT NULL;

-- Support: one student's timeline, newest first.
CREATE INDEX IF NOT EXISTS idx_nclex_auth_events_user_time
  ON nclex_auth_events (user_id, occurred_at DESC)
  WHERE user_id IS NOT NULL;

-- The retention sweep in section 4, which scans by age alone.
CREATE INDEX IF NOT EXISTS idx_nclex_auth_events_occurred
  ON nclex_auth_events (occurred_at);


-- ── 3. RLS — append-only is enforced, not remembered ─────────────────
-- ⭐ THE ABSENT POLICIES ARE THE DESIGN. There is a SELECT policy and
-- nothing else: no INSERT, no UPDATE, no DELETE, for anybody. With RLS
-- enabled, an operation with no policy is denied — so "no row is ever
-- updated" is something the database refuses rather than something a
-- future call site has to honour.
--
-- Writes therefore come through createServiceRoleClient(), which bypasses
-- RLS. That is not a workaround bolted on to get past the above; it is
-- required anyway. The most important row this table stores is a FAILED
-- login, and a failed login has no authenticated user — auth.uid() is
-- NULL, so an ordinary client's INSERT could never be written by any
-- policy we could express.

ALTER TABLE nclex_auth_events ENABLE ROW LEVEL SECURITY;

-- USERS_MANAGE, not a bare SUPER_ADMIN check: nclex_user_has_permission
-- already returns true for SUPER_ADMIN, and this is exactly the bucket
-- the future "account activity" panel on admin user detail will sit
-- behind. A student cannot read her own rows — deliberately. The support
-- answer is given BY support; handing a student the log would hand an
-- attacker who got in once a list of every address they had tried.
DROP POLICY IF EXISTS nclex_auth_events_admin_read ON nclex_auth_events;
CREATE POLICY nclex_auth_events_admin_read
  ON nclex_auth_events FOR SELECT
  TO authenticated
  USING (nclex_user_has_permission('USERS_MANAGE'));


-- ── 4. retention — 90 days ───────────────────────────────────────────
-- ⓘ A retention DELETE is not a contradiction of "append-only". That rule
-- is about an event's record never being REVISED after the fact; this
-- removes whole rows wholesale on age, and never edits one. It runs
-- through a SECURITY DEFINER function owned by the table owner, which is
-- also how it deletes at all given section 3 grants no delete policy.
--
-- The window lives in nclex_config rather than in this SQL so changing
-- your mind later is a settings edit, not a migration. 90 days agreed
-- with Sam 2026-08-06: long enough to cover "this started a few weeks
-- ago" support cases, short enough that the IP column's privacy cost
-- stays bounded.

INSERT INTO nclex_config (key, value, description) VALUES
  ('auth_events_retention_days', '90',
   'How many days of authentication log to keep. Rows older than this are deleted nightly. Set to 0 to keep forever.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION nclex_purge_auth_events()
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_days INTEGER;
  v_rows INTEGER;
BEGIN
  SELECT NULLIF(value, '')::INTEGER INTO v_days
  FROM nclex_config WHERE key = 'auth_events_retention_days';

  -- Missing key or an explicit 0 both mean "keep everything". A missing
  -- key must NOT be read as "delete everything", which is what a bare
  -- COALESCE(v_days, 0) in the DELETE below would have done.
  IF v_days IS NULL OR v_days <= 0 THEN
    RETURN 0;
  END IF;

  DELETE FROM nclex_auth_events
  WHERE occurred_at < now() - (v_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE EXECUTE ON FUNCTION nclex_purge_auth_events() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION nclex_purge_auth_events() IS
  'Deletes nclex_auth_events rows older than the auth_events_retention_days '
  'config value. Run nightly by pg_cron. Returns rows deleted, or 0 when '
  'the window is unset or 0. Granted to nobody — cron runs as the owner.';


-- ── 5. the schedule ──────────────────────────────────────────────────
-- 03:30 — the enrolment sweep holds 02:00 and the item-stats refresh
-- holds 03:00; there is no reason for three jobs to contend. The named
-- overload upserts by job name, so re-running this migration refreshes
-- the schedule rather than stacking a second copy.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'nclex-auth-events-purge-nightly',
  '30 3 * * *',
  $cron$ SELECT public.nclex_purge_auth_events(); $cron$
);
