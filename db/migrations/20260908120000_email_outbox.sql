-- ─────────────────────────────────────────────────────────────────────
-- nclex_email_outbox — the queue every email we compose passes through
-- ─────────────────────────────────────────────────────────────────────
-- Build-order item 6, slice 1a (docs/product-plan/transactional-email.md).
-- The first CODE slice of the email arc; before this, the repo had no
-- `resend` package, no lib/email/, and workers/ held one .gitkeep.
--
-- NOTHING SENDS AN EMAIL DIRECTLY. EVERYTHING WRITES A ROW.
--   1. Something decides an email is owed — an event (a payment landed)
--      or the clock (a due date is three days away).
--   2. That writes one row here.
--   3. A sender renders it, hands it to Resend, and records what came
--      back — sent, or the reason it did not go.
--
-- The queue is the whole design. It is why "did Ama get her receipt?"
-- has an answer, why a retry is possible at all, and why the clock and
-- the event paths can share one sender. Every send is recorded, the
-- instant ones included — once the table exists, recording costs nothing.
--
-- ⭐ WHY NOT JUST READ RESEND'S API (asked and answered 2026-08-11).
-- Resend genuinely does expose the sent list, per-email `last_event`, and
-- the retained body — so "did it arrive?" is answerable there, and this
-- table deliberately does NOT duplicate that (see provider_message_id).
-- Four things it structurally cannot do, though, and each is fatal alone:
--   1. It only knows what it ACCEPTED. A rejected call, a wrong key, a
--      job that never ran — none create a record there. The list simply
--      comes back shorter, and a shorter list is indistinguishable from a
--      quiet week. That is gamma's condition today.
--   2. Duplicate protection has to happen BEFORE the network call. Two
--      Paystack retries land in the same second; the unique index below
--      refuses the second. Asking Resend "did I send this already?" is
--      check-then-act across a network — the exact race it must win.
--   3. "Who have I already warned?" has to be answerable at scan speed.
--      The nightly job walks every enrolment on a plan; that is one
--      indexed query here, versus an HTTP call per student there.
--   4. A FAILED send left nothing at Resend to retry FROM — no payload,
--      no recipient, no snapshot.
-- Division of labour: this table owns INTENT and ATTEMPT. Resend owns
-- OUTCOME. provider_message_id is the join between them.
--
-- SENDS STAY APP-LAYER, NEVER FROM A POSTGRES TRIGGER. One clarification
-- on that standing rule: a pg_cron job WRITING a row here is not a send,
-- it is an enqueue, and that is allowed (slice 1b). The send itself
-- always happens in app code.


-- ── 1. the table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nclex_email_outbox (
  email_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── the fingerprint: which email · what about · which stage ────────
  -- Together these are what makes two rows "the same email", and the
  -- unique index in section 2 is what refuses the duplicate. The
  -- DATABASE refuses it, not the code: "check whether it exists, then
  -- insert" loses the race when two Paystack retries arrive at the same
  -- moment, which is the exact situation it exists for.

  -- Which email. dot.case, matching a row in the doc's catalog —
  -- 'payment.received', 'payment.installment_due'.
  event_key           TEXT        NOT NULL,

  -- What it is ABOUT. ⚠ Not the email's subject line — that is
  -- rendered_subject below.
  --
  -- ⭐ For a receipt this is the CHECKOUT GROUP, not the payment row.
  -- nclex_payments.checkout_group_id groups the rows of one combined
  -- charge and paystack_reference is shared across them, so a student
  -- who buys a programme place and ticks bank access at the same
  -- checkout produces TWO payment rows from ONE card debit. Keyed on
  -- payment_id she would receive two receipts for one charge — the
  -- "have I been charged twice?" alarm the fingerprint exists to
  -- prevent. Confirmed against dev data 2026-08-11: three such combined
  -- groups exist, all PROGRAMME_INITIAL + BANK_OPTIN_AT_PROGRAMME.
  --
  -- Plain TEXT, and deliberately NOT a foreign key: across the catalog
  -- this points at checkouts, enrolments, cohort sessions and enquiries,
  -- so no one FK could serve, and a snapshot-carrying row must outlive
  -- whatever it refers to anyway.
  subject_ref         TEXT        NOT NULL,

  -- Which step, when an email is one of a series: '-' for a one-off,
  -- 'T-3' / 'due-24h' for the installment reminder.
  --
  -- ⚠ NEVER BLANK, and the CHECK below enforces it. Postgres treats two
  -- NULLs in a uniqueness rule as NOT equal to each other, so two
  -- "no stage" rows would BOTH be admitted and the protection would
  -- silently fail to apply to exactly the instant emails that most need
  -- it. A dash is a value; an absence is not.
  stage               TEXT        NOT NULL DEFAULT '-',

  -- ── who it is for ─────────────────────────────────────────────────

  -- The address. THE recipient — not a pointer to one.
  --
  -- ⭐ This is a finding, not a preference. The instinct is to store
  -- which USER the email is for; that is exactly what broke the pay-first
  -- payment on 2026-06-24. Someone who has paid but has not yet set up an
  -- account exists in auth.users with NO nclex_users profile row, and
  -- nclex_payments.user_id FKs to nclex_users — so writing the link threw
  -- a foreign-key violation that was silently swallowed, leaving the
  -- payment PAID and unlinked. A receipt has to be able to reach someone
  -- who does not have an account yet, which is precisely the person most
  -- in need of one.
  to_email            TEXT        NOT NULL,

  -- Which account, WHEN there is one. A convenience for the admin page
  -- so a row can link back to a profile.
  --
  -- ⚠ Deliberately NOT a foreign key, for the reason directly above: the
  -- pay-first buyer has no profile row when her receipt is enqueued, and
  -- an FK here would reject the whole insert exactly as it did in June.
  -- Nullable, unenforced, filled in when known.
  to_user_id          UUID,

  -- ── what it says ──────────────────────────────────────────────────

  -- ⭐ A SNAPSHOT, NOT A LOOKUP. Every fact the template needs, frozen
  -- at the moment the email was owed: amounts, names, dates, what the
  -- purchase got her. A receipt re-sent in October still states what she
  -- was actually charged in August, and rendering never re-reads tables
  -- that have moved on. Precedent in this schema:
  -- nclex_enrolments.strategy_snapshot_json, for the same reason.
  payload_json        JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- The subject line as ACTUALLY sent, stamped at send time. Stored
  -- rather than re-derived so a later wording change cannot rewrite what
  -- the record says we sent. NULL until the first successful send.
  rendered_subject    TEXT,

  -- ── how it is going ───────────────────────────────────────────────

  --   QUEUED  waiting its turn
  --   SENT    handed to Resend and accepted
  --   FAILED  last attempt failed; still inside the automatic window
  --   DEAD    given up on; needs a person (the admin page's default view)
  --   EXPIRED went stale unsent — see expires_at
  --
  -- ⚠ SENT means "Resend accepted it", NOT "she received it". A bounce
  -- happens after acceptance and is invisible from the send call; the
  -- admin page reads that from Resend via provider_message_id.
  status              TEXT        NOT NULL DEFAULT 'QUEUED',

  attempts            INTEGER     NOT NULL DEFAULT 0,

  -- ⭐ TWO error columns because they serve different readers, and the
  -- split is what makes the retry rule possible (settled 2026-08-11).
  --
  -- last_error_code is Resend's machine name — 'rate_limit_exceeded',
  -- 'validation_error', 'daily_quota_exceeded', 'invalid_api_key'. THE
  -- REASON DECIDES THE RETRY, NOT A COUNT:
  --   · can never work (validation_error, invalid_from_address,
  --     missing_required_field, invalid_attachment) → DEAD on the FIRST
  --     failure. No point waiting a day to learn what Resend already
  --     told us, and a stuck page full of rows that were only ever going
  --     to fail is a stuck page nobody reads.
  --   · transient (rate_limit_exceeded, application_error,
  --     internal_server_error) → retry with widening gaps. The attempt
  --     count is a backstop here, and only here.
  --   · quota (daily_/monthly_quota_exceeded) → retry, but send_after is
  --     TOMORROW, not ten minutes.
  --   · our key (missing_/invalid_/restricted_api_key) → keep retrying
  --     AND alarm: this is not about one email, EVERY email is failing,
  --     and it drains by itself the moment the key is fixed.
  --
  -- ⚠ There is no error for a bad RECIPIENT in that list. A typo'd or
  -- non-existent address returns SUCCESS and bounces afterwards, so it
  -- never enters the retry loop at all — it leaves here as SENT. That
  -- gap is covered by reading Resend's last_event, not by this column.
  last_error_code     TEXT,

  -- The sentence a human reads on the admin page.
  last_error_message  TEXT,

  -- ── timing ────────────────────────────────────────────────────────

  -- "Do not try before this." Defaults to now, i.e. send immediately.
  -- ⭐ One column doing two jobs: a reminder written tonight for tomorrow
  -- morning, and a failed send waiting ten minutes before its next go.
  -- Same meaning, wildly different numbers, no second mechanism.
  send_after          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- "If this has not gone by then, do not send it — mark it EXPIRED."
  --
  -- ⓘ EMPTY FOR EVERYTHING IN SLICE 1a, on purpose. This is a CAPABILITY,
  -- not a policy. Whether a late email should still go is an editorial
  -- judgement per email — a 3-days-out warning sent a day late is a
  -- 2-days-out warning and still useful; a "due within 24 hours" warning
  -- sent a day late arrives AFTER she has been paused and reads like the
  -- system does not know what it did to her. Settled with Sam
  -- 2026-08-11: each email answers that when its turn comes, and the
  -- table's job is only to be able to express either answer without a
  -- migration.
  expires_at          TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at     TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,

  -- ── the other half of the picture ─────────────────────────────────

  -- Resend's own id for the email, stamped on success. THE JOIN to their
  -- data: with it the admin page can ask them "did this land, or did it
  -- bounce?" per row, on demand — which recovers most of what deferring
  -- the bounce webhook costs us, with no public endpoint and no
  -- signature verification to build.
  provider_message_id TEXT,

  CONSTRAINT nclex_email_outbox_status_ck
    CHECK (status IN ('QUEUED', 'SENT', 'FAILED', 'DEAD', 'EXPIRED')),

  -- The blank-stage trap, enforced rather than remembered.
  CONSTRAINT nclex_email_outbox_stage_ck
    CHECK (stage <> '')
);

COMMENT ON TABLE nclex_email_outbox IS
  'Queue of every email this app composes. Written by enqueue helpers in '
  'lib/email/outbox.ts (events) and, from slice 1b, by the nightly sweep '
  '(the clock). Sent by lib/email/send.ts via Resend. Owns intent and '
  'attempt; Resend owns delivery outcome, joined on provider_message_id. '
  'Does NOT cover Supabase Auth identity mail (invite, reset, confirm) — '
  'those are composed in a Supabase dashboard, not here.';

COMMENT ON COLUMN nclex_email_outbox.subject_ref IS
  'What the email is ABOUT (checkout group, enrolment, session) — not '
  'the subject line. Part of the fingerprint.';

COMMENT ON COLUMN nclex_email_outbox.to_email IS
  'The recipient address itself. Deliberately not a user reference: a '
  'pay-first buyer has no profile row when her receipt is enqueued.';

COMMENT ON COLUMN nclex_email_outbox.status IS
  'SENT means Resend accepted it, not that it was delivered. Delivery '
  'and bounces are read from Resend via provider_message_id.';


-- ── 2. indexes — one per reader ──────────────────────────────────────

-- ⭐ THE ONE THAT MATTERS. This is the duplicate-refuser: it makes a
-- second receipt for the same checkout physically impossible, so
-- enqueuing becomes safe to ATTEMPT repeatedly. Any path may say "there
-- should be a receipt for this checkout" as often as it likes — the
-- first wins, the rest are no-ops. That is what lets Paystack's callback
-- and the tutor's "mark paid" button both point at the same email
-- without either knowing the other exists.
--
-- ⚠ Too tight is more dangerous than too loose. Too loose sends
-- duplicates: annoying, someone complains, you find out. Too tight sends
-- NOTHING, and nobody ever reports an email they did not know was
-- coming. Which is why `stage` is in the key — without it, installment
-- #2's warning would be suppressed by #1's, and the first thing the
-- student would hear is her access being paused.
CREATE UNIQUE INDEX IF NOT EXISTS idx_nclex_email_outbox_fingerprint
  ON nclex_email_outbox (event_key, subject_ref, stage);

-- The sender: "what is due to go right now?" Also serves the admin
-- page's stuck list, which filters on status alone.
CREATE INDEX IF NOT EXISTS idx_nclex_email_outbox_due
  ON nclex_email_outbox (status, send_after);

-- Support: "what have we sent this person?", newest first.
CREATE INDEX IF NOT EXISTS idx_nclex_email_outbox_recipient
  ON nclex_email_outbox (to_email, created_at DESC);


-- ── 3. RLS — read for admins, writes only from the server ────────────
-- ⭐ THE ABSENT POLICIES ARE THE DESIGN, the same way they are on
-- nclex_auth_events. There is a SELECT policy and nothing else: with RLS
-- enabled, an operation with no policy is denied, so "the browser cannot
-- queue an email" is something the database refuses rather than
-- something every future call site has to remember.
--
-- Writes therefore go through createServiceRoleClient(), which bypasses
-- RLS. That is required, not a workaround: the most important row this
-- table holds is the receipt for a PAY-FIRST buyer, who by definition
-- has no session and no profile — auth.uid() is NULL, so no policy we
-- could express would ever let her row be written.

ALTER TABLE nclex_email_outbox ENABLE ROW LEVEL SECURITY;

-- COMMS_MANAGE, the bucket that already gates /admin/announcements —
-- nclex_user_has_permission returns true for SUPER_ADMIN anyway, so this
-- is the narrower correct gate rather than a bare role check.
--
-- A student cannot read her own rows. The payload carries frozen money
-- facts and the queue's failure reasons are operational detail; the
-- support answer is given BY support.
DROP POLICY IF EXISTS nclex_email_outbox_admin_read ON nclex_email_outbox;
CREATE POLICY nclex_email_outbox_admin_read
  ON nclex_email_outbox FOR SELECT
  TO authenticated
  USING (nclex_user_has_permission('COMMS_MANAGE'));
