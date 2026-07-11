-- mynclex/db/migrations/20260724120000_trial_is_a_bank_duration.sql
--
-- Readiness student Slice ① follow-on (settled with Sam 2026-07-08):
-- the trial is a BANK_DURATION pass that costs nothing, not its own
-- product type. `pack_type` answers "what does this grant?"; `kind`
-- answers "do you pay for it?". Encoding the trial in BOTH was
-- redundant, and pack_type='TRIAL' was the odd one out.
--
-- Applied by hand on dev 2026-07-08; this file carries it to prod and
-- makes the migration history reproduce dev's state.
--
-- ⚠ This also FIXES A LATENT BUG. lib/payments/activate.ts computes a
-- subscription's expiry as:
--     pack_type = 'BANK_DURATION' AND duration_days  →  now + days
--     otherwise                                      →  end_at NULL
-- Under the old typing the trial hit the `otherwise` branch, so an
-- activated 7-day trial would have been granted bank access with NO
-- END DATE. Never bitten (trial signup is unwired; zero TRIAL
-- subscription rows on dev or prod — verified), and now impossible.
--
-- Downstream reads verified safe before applying: the public bank page,
-- bank checkout, and the programme bank add-on all additionally require
-- kind='PAID', so the trial stays unlisted + unsellable; entitlement
-- reads (nclex_subscriptions.pack_type) accept BANK_DURATION.
-- A trial subscription is now identified by source='SELF_TRIAL_SIGNUP'
-- — how it was acquired, not what it grants.

-- ── 1. Re-type the trial product ─────────────────────────────────────
UPDATE nclex_products
   SET pack_type = 'BANK_DURATION'
 WHERE product_id = 'NCLEX_TRIAL'
   AND pack_type = 'TRIAL';

-- ── 2. Retire 'TRIAL' as a product pack_type ─────────────────────────
-- Zero rows use it after step 1; tightening stops it coming back.
-- nclex_subscriptions.pack_type keeps its 'TRIAL' value in the CHECK:
-- the column is a denormalised historical stamp and the entitlement
-- reads accept it defensively. Nothing writes it any more.
ALTER TABLE nclex_products
  DROP CONSTRAINT nclex_products_pack_type_check;
ALTER TABLE nclex_products
  ADD CONSTRAINT nclex_products_pack_type_check
  CHECK (pack_type IN ('BANK_DURATION','READINESS'));
