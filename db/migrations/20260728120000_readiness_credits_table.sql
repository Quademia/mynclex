-- mynclex/db/migrations/20260728120000_readiness_credits_table.sql
--
-- Readiness student Slice ②a.1 — the credits table + the subscription
-- cleanup. Plan: docs/product-plan/readiness-packs.md §7 (accepted
-- shape 2026-07-04; SQL-enforced no-subscription rule + drops settled
-- 2026-07-08).
--
-- What a credit is: however a readiness entitlement arrives (a
-- standalone READINESS purchase, a bundled credit on a longer bank
-- pass, or an admin grant), what the student HOLDS is a credit —
-- claimed against a pack of their choosing later, then activated for
-- its own one-shot 21-day window. One row per credit.
--
-- THE SHAPE IS DELIBERATELY STATUS-FREE (Sam, 2026-07-04): a credit's
-- life is strictly one-way, so the event timestamps ARE the state. The
-- stage is derived (in TS, creditStage() — Slice ②a.3) from which
-- blanks are filled:
--   created_at only ............ unclaimed credit
--   + claimed_at / pack_id ..... claimed (a named pack)
--   + activated_at / expires_at  window running (the 21-day clock)
--   then exactly ONE of:
--     used_at / attempt_id ..... the shot was taken (sat, even partial)
--     expired_at ............... the window lapsed unused (nightly sweep)
--     revoked_at ............... taken back (refund / admin correction)
--
-- expires_at (the deadline) vs expired_at (the lapse event) are both
-- needed: DB rules read only what's in the row (never the clock), so
-- the sweep stamping expired_at is what lets the no-double-claim index
-- release a lapsed pack. §2 → "One shot, abandonment & re-claiming".
--
-- This migration is Slice ②a.1 ONLY: the table + rules + RLS, and the
-- subscription cleanup. The mint (②a.2) and the read/stage helper
-- (②a.3) are app-layer and land next; nothing writes this table yet.

-- ── 1. The credits table ─────────────────────────────────────────────
CREATE TABLE nclex_readiness_credits (
  credit_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),          -- #1
  user_id         UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,  -- #2
  source          TEXT NOT NULL
                  CHECK (source IN ('SELF_PURCHASE','BANK_BUNDLE','ADMIN_GRANT')),  -- #3
  payment_id      UUID REFERENCES nclex_payments(payment_id) ON DELETE RESTRICT,   -- #4 (NULL for admin grants)
  granted_by      UUID REFERENCES nclex_users(id) ON DELETE SET NULL,              -- #5 (admin grants only)
  pack_id         TEXT REFERENCES nclex_readiness_packs(pack_id) ON DELETE RESTRICT,  -- #6 (NULL before claim; RESTRICT = a claimed pack can't be deleted)
  attempt_id      UUID REFERENCES nclex_attempts(attempt_id) ON DELETE RESTRICT,   -- #7 (NULL before the sitting)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),                  -- #8  minted
  claimed_at      TIMESTAMPTZ,                                         -- #9  pack picked (with #6)
  activated_at    TIMESTAMPTZ,                                         -- #10 window started
  expires_at      TIMESTAMPTZ,                                         -- #11 the deadline = activation + 21d, frozen (with #10)
  used_at         TIMESTAMPTZ,                                         -- #12 sitting completed (with #7)
  expired_at      TIMESTAMPTZ,                                         -- #13 lapse event (nightly sweep)
  revoked_at      TIMESTAMPTZ,                                         -- #14 taken back
  revoked_reason  TEXT,                                                -- #15 why (with #14)
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),                  -- #16 housekeeping

  -- Provenance must exist and match the source. A paid credit (self or
  -- bundled) points at its receipt and was not admin-granted; an admin
  -- grant has a granting admin and no payment.
  CONSTRAINT nclex_readiness_credits_provenance CHECK (
    (source IN ('SELF_PURCHASE','BANK_BUNDLE') AND payment_id IS NOT NULL AND granted_by IS NULL)
    OR (source = 'ADMIN_GRANT' AND granted_by IS NOT NULL AND payment_id IS NULL)
  ),

  -- A claim names a pack: claimed_at and pack_id are set together, or
  -- neither is.
  CONSTRAINT nclex_readiness_credits_claim_names_pack CHECK (
    (claimed_at IS NULL) = (pack_id IS NULL)
  ),

  -- Activation requires a claim (can't start a window on an unclaimed
  -- credit), and activated_at / expires_at are stamped together.
  CONSTRAINT nclex_readiness_credits_activation_requires_claim CHECK (
    activated_at IS NULL OR claimed_at IS NOT NULL
  ),
  CONSTRAINT nclex_readiness_credits_activation_sets_deadline CHECK (
    (activated_at IS NULL) = (expires_at IS NULL)
  ),

  -- Used requires activation, and used_at / attempt_id are stamped
  -- together (the one sitting that consumed the shot).
  CONSTRAINT nclex_readiness_credits_used_requires_activation CHECK (
    used_at IS NULL OR activated_at IS NOT NULL
  ),
  CONSTRAINT nclex_readiness_credits_used_names_attempt CHECK (
    (used_at IS NULL) = (attempt_id IS NULL)
  ),

  -- Expiry (unstarted lapse) can only follow activation — an unclaimed
  -- or claimed-but-unactivated credit never "expires", it just waits.
  CONSTRAINT nclex_readiness_credits_expiry_requires_activation CHECK (
    expired_at IS NULL OR activated_at IS NOT NULL
  ),

  -- Revocation carries a reason.
  CONSTRAINT nclex_readiness_credits_revoke_has_reason CHECK (
    (revoked_at IS NULL) = (revoked_reason IS NULL)
  ),

  -- The three terminal events are mutually exclusive: a credit's story
  -- ends exactly once (used OR expired OR revoked).
  CONSTRAINT nclex_readiness_credits_one_ending CHECK (
    (used_at IS NOT NULL)::int
    + (expired_at IS NOT NULL)::int
    + (revoked_at IS NOT NULL)::int <= 1
  )
);

-- ── 2. Indexes ───────────────────────────────────────────────────────
-- Read a student's credits (the dashboard + claiming surfaces).
CREATE INDEX idx_nclex_readiness_credits_user
  ON nclex_readiness_credits (user_id);

-- Idempotent minting: "has this payment already minted its credits?"
-- One payment mints N credits (BANK_90D → 2), so this is NOT unique.
CREATE INDEX idx_nclex_readiness_credits_payment
  ON nclex_readiness_credits (payment_id)
  WHERE payment_id IS NOT NULL;

-- No two LIVE claims on the same pack per student — the one-shot-per-pack
-- rule with teeth (§2 r4). A claim counts as live unless it has lapsed
-- (expired_at) or been taken back (revoked_at); a USED claim stays live
-- forever, which is exactly right — a sat pack can never be re-claimed.
-- An expired-unused or revoked claim releases the pack for a fresh credit.
CREATE UNIQUE INDEX idx_nclex_readiness_credits_one_live_claim_per_pack
  ON nclex_readiness_credits (user_id, pack_id)
  WHERE pack_id IS NOT NULL AND expired_at IS NULL AND revoked_at IS NULL;

-- ── 3. RLS ───────────────────────────────────────────────────────────
-- Mirror of nclex_subscriptions: the owner reads their own rows, plus
-- SUPER_ADMIN; every write goes through a service-role server action
-- (the mint, and the future claim/activate transitions) that
-- re-validates the transition — the layered-enforcement rule. The
-- admin_all policy also lets SUPER_ADMIN make + revoke manual grants.
ALTER TABLE nclex_readiness_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY nclex_readiness_credits_owner_select
  ON nclex_readiness_credits FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'));

CREATE POLICY nclex_readiness_credits_admin_all
  ON nclex_readiness_credits FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));

-- ── 4. nclex_subscriptions cleanup ───────────────────────────────────
-- Bank time only, enforced in SQL (§7 → "Three tables, three jobs",
-- settled 2026-07-08). A readiness purchase creates NO subscription
-- row (its credits live in the table above), so:
--   • drop the two never-written readiness columns (verified 0 rows
--     populated on dev, 0 subscription rows at all on prod);
--   • narrow the pack_type CHECK to BANK_DURATION alone. Both other
--     values became unreachable and nothing cleaned up after them:
--     TRIAL when 20260724120000 made the trial a free BANK_DURATION
--     pass, and READINESS once activate.ts (②a.2) stops granting a
--     subscription for READINESS_PURCHASE. A permissive CHECK for a
--     state the product forbids just lets the DB record the bug.
ALTER TABLE nclex_subscriptions DROP COLUMN readiness_pack_id;
ALTER TABLE nclex_subscriptions DROP COLUMN readiness_activated_at;

ALTER TABLE nclex_subscriptions
  DROP CONSTRAINT nclex_subscriptions_pack_type_check;
ALTER TABLE nclex_subscriptions
  ADD CONSTRAINT nclex_subscriptions_pack_type_check
  CHECK (pack_type = 'BANK_DURATION');
