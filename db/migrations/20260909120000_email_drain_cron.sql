-- =========================================================
-- MyNclex — The doorbell: pg_cron knocks on the email drain
-- File: mynclex/db/migrations/20260909120000_email_drain_cron.sql
-- =========================================================
-- Slice 1a built a queue and a sender, and every send since has ridden out
-- on somebody's request under `waitUntil`. Two situations have no request,
-- and until now nothing came back for either of them:
--
--   ⏰ THE SCHEDULED HALF. The 02:00 sweep decides an email is owed and
--      writes it at a moment when nobody is awake. For the whole
--      time-driven half the drain is not the safety net — it is the ONLY
--      delivery path.
--
--   ⚠ THE RETRY POLICY, DESIGNED AND NEVER RUNNING. On failure the sender
--      pushes `send_after` forward and returns; nothing re-read the row. So
--      "five attempts inside an hour, then a human" (settled 2026-08-11)
--      has never actually retried anything.
--
-- `app/cron/email-drain` (2026-08-18) is the door. This is the doorbell.
--
-- ⭐ WHY pg_cron AND NOT GITHUB ACTIONS. The retry delays are 1, 5, 15 and
-- 30 minutes, so the knock has to come every few minutes or the window it
-- implements stops being an hour. GitHub's schedules floor at 5 minutes and
-- bill a full minute per run, which on a private repo is ~8,600 minutes a
-- month against a 2,000 allowance. pg_cron already runs three jobs on this
-- database, costs nothing, and is the same scheduler the sweep itself uses
-- — so this is not a second mechanism to keep in step, which was the whole
-- objection.
--
-- ⓘ AND WHY THE DATABASE STILL DOES NOT SEND. pg_net can make the call but
-- cannot RENDER: the templates are .ts files. So Postgres's part ends at
-- "there is post". The standing rule holds unchanged — SENDS STAY
-- APP-LAYER, NEVER FROM A POSTGRES TRIGGER. Ringing is not sending.
--
-- Source of truth: docs/product-plan/transactional-email.md → "1b — the shape"


-- =========================================================
-- 1. Outbound HTTP from SQL
-- =========================================================
-- Available on both MyNclex projects and previously unused. Installs into
-- its own `net` schema (verified on dev 2026-08-18) — the function below
-- qualifies every call, so search_path stays `public` and nothing depends
-- on where a future version puts itself.

CREATE EXTENSION IF NOT EXISTS pg_net;


-- =========================================================
-- 2. The two settings
-- =========================================================
-- ⭐ THE URL IS DELIBERATELY BLANK HERE. One migration file runs against
-- both projects, and each must knock on its OWN Worker — dev's database
-- calling the prod app would drain the live queue. So the value is set per
-- project, out of band, and the key is seeded empty rather than omitted so
-- that anyone reading nclex_config can see the setting exists and is
-- unfilled. The function refuses loudly rather than knocking nowhere.
--
-- ⚠ RELEASE CHECKLIST: prod needs `email_drain_url` set to the prod Worker
-- and its own secret in Vault (section 3) before this job does anything at
-- all. A silent no-op is the failure this layer exists to catch, so the
-- function raises a warning on every run until both are present.
--
-- The on/off switch mirrors `enrolment_sweep_enabled` and
-- `cat_recalibration_enabled`: stopping a scheduled job is a settings edit,
-- not a code change and a deploy.

INSERT INTO nclex_config (key, value, description) VALUES
  ('email_drain_enabled', 'true',
   'Whether the scheduled knock on the email drain runs. Set to false to stop all scheduled and retried email without a deploy; instant sends are unaffected.'),
  ('email_drain_url', '',
   'This project''s own email-drain endpoint, e.g. https://<worker-host>/cron/email-drain. Per-project: dev must point at the dev Worker and prod at prod. Blank means the knock does nothing.')
ON CONFLICT (key) DO NOTHING;


-- =========================================================
-- 3. The knock
-- =========================================================
-- ⚠ THE SECRET IS NOT IN THIS FILE AND MUST NEVER BE. It lives in Supabase
-- Vault under the name below, set per project by hand, so that a migration
-- committed to the repo never carries a credential. The same value has to
-- be set on that project's Worker as a Cloudflare secret — the door and the
-- postman need the same key, and a mismatch is a 401 every five minutes.
--
-- ⓘ There is no "did it work" table here on purpose: pg_net already records
-- every call it made, with the status code and the body the app returned,
-- in `net._http_response`. That answers "is the drain still running, and
-- what did it say" without a second ledger to maintain. ⚠ Supabase prunes
-- that table (hours, not days), so it is a live view rather than history —
-- the durable record of any individual email remains the outbox row itself.

CREATE OR REPLACE FUNCTION nclex_email_drain_knock()
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_enabled TEXT;
  v_url     TEXT;
  v_secret  TEXT;
BEGIN
  v_enabled := COALESCE(
    (SELECT value FROM nclex_config WHERE key = 'email_drain_enabled'),
    'true'
  );
  IF v_enabled = 'false' THEN
    RETURN;
  END IF;

  SELECT NULLIF(value, '') INTO v_url
  FROM nclex_config WHERE key = 'email_drain_url';

  IF v_url IS NULL THEN
    -- Loud, not silent. A drain that never knocks looks exactly like a
    -- product with no mail to send.
    RAISE WARNING 'nclex_email_drain_knock: nclex_config.email_drain_url is not set — no knock sent.';
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'nclex_email_drain_cron_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'nclex_email_drain_knock: vault secret nclex_email_drain_cron_secret is missing — no knock sent.';
    RETURN;
  END IF;

  -- Fire and forget: pg_net queues the request and returns an id
  -- immediately, so a slow or unreachable app never holds a cron worker
  -- open. The outcome lands in net._http_response.
  --
  -- ⚠ The timeout is generous because ONE knock may send up to 25 emails
  -- sequentially. A tighter timeout would record failures for work that in
  -- fact completed — the app keeps going regardless of whether Postgres is
  -- still listening.
  PERFORM net.http_post(
    url     := v_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type',  'application/json'
    ),
    timeout_milliseconds := 30000
  );
END;
$$;

-- Nobody but the scheduler. The function holds a credential and triggers
-- outbound mail; there is no reason for a session role to reach it.
REVOKE EXECUTE ON FUNCTION nclex_email_drain_knock() FROM PUBLIC, anon, authenticated;


-- =========================================================
-- 4. Every five minutes
-- =========================================================
-- ⭐ FIVE, NOT ONE. The retry delays are 1/5/15/30 minutes, so a five-minute
-- knock lands the five attempts at roughly 5, 10, 25 and 55 minutes — still
-- "inside the hour", which is the property Sam's short window was chosen
-- for. Per-minute would be 1,440 knocks a day at an almost always empty
-- queue for a few minutes' better granularity on the first retry only.
--
-- ⓘ Scheduling by NAME re-schedules rather than stacking a second copy, so
-- re-running this migration is safe. Same idiom as the auth-events purge.
--
-- ⚠ The 02:00 sweep is unaffected and still owns deciding WHO gets mail.
-- This job only posts what has already been decided.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'nclex-email-drain',
  '*/5 * * * *',
  $cron$ SELECT public.nclex_email_drain_knock(); $cron$
);
