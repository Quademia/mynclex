-- =========================================================
-- MyNclex — The give-up rule counts only what it was meant to count
-- File: mynclex/db/migrations/20260910120000_email_outbox_transient_attempts.sql
-- =========================================================
-- ⚠ A GAP BETWEEN A PROMISE AND THE CODE, found 2026-08-18 while building
-- the drain. Both `send.ts` and 20260908120000's own column comment state
-- the rule plainly:
--
--   "transient → retry with widening gaps. The attempt count is a
--    backstop HERE, AND ONLY HERE."
--   "quota must NOT count toward the death limit — five quota failures
--    could be five days apart."
--
-- Neither was true. All four failure classes incremented one `attempts`
-- column and the transient branch read it, so a row that hit the daily
-- ceiling five nights running would be killed by its FIRST ordinary
-- hiccup, having never once been retried.
--
-- ⭐ AND THE ONE-LINE FIX DOES NOT WORK, which is why this is a column.
-- "Stop counting quota failures" breaks the api-key branch, which needs
-- `attempts` to keep GROWING because it indexes its back-off by it —
-- freeze the counter and it evaluates RETRY_DELAYS_MS[-1], i.e.
-- undefined, into a Date. One class needs the number rising and another
-- needs it still. One counter cannot do both jobs.
--
-- So: two counters, one job each.
--
--   attempts            "times tried"  — the honest total, whatever the
--                       reason. Feeds the admin page and the api-key
--                       back-off. UNCHANGED in meaning and behaviour.
--   transient_attempts  "strikes"      — ordinary hiccups only. The give-
--                       up rule reads this and nothing else.
--
-- ⓘ Why it has never bitten: we have never approached Resend's free
-- 100/day ceiling, and it needs repeated quota failures FOLLOWED BY a
-- hiccup. ⚠ That changes with the next build — 1b puts the queue on a
-- clock, and a cohort-wide session email can spend a day's allowance in
-- one send. The ceiling stops being theoretical at exactly the moment
-- the queue starts filling itself.
--
-- Source of truth: docs/product-plan/transactional-email.md → "The drain"


ALTER TABLE nclex_email_outbox
  ADD COLUMN IF NOT EXISTS transient_attempts INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN nclex_email_outbox.transient_attempts IS
  'Strikes: failures of the TRANSIENT class only (hiccups — rate limits, application errors). The automatic give-up rule reads this and nothing else, so a run of quota nights or a bad api key cannot spend an email''s retry window. The honest total of tries stays in attempts.';

-- ⓘ Existing rows default to 0 strikes, which hands any currently-FAILED
-- row a fresh window. Deliberate and harmless: it is the right outcome
-- for a row whose count was inflated by the very bug this fixes, and at
-- the time of writing every row in both environments is already SENT.
