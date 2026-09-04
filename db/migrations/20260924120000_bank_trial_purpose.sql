-- mynclex/db/migrations/20260924120000_bank_trial_purpose.sql
--
-- The 7-day bank trial, slice 1 of 6 (settled with Sam 2026-09-04).
-- Doc: docs/product-plan/payments-and-enrolment.md → "Trial card".
--
-- ⭐ THE TRIAL IS AN ORDER THAT COST NOTHING, not a parallel mechanism.
-- The design that lost: a separate `nclex_trial_requests` table holding
-- "this email asked for a trial", plus its own grant path. It was
-- proposed on the belief that nclex_payments records MONEY and a ₵0 row
-- would be a lie in it. That belief is false, and the schema above says
-- so: the table already holds INIT rows (abandoned, no money moved),
-- FAILED rows, and collection_channel='OFF_PLATFORM' rows (money that
-- never touched Paystack). It is an ORDER ledger — a record of intents
-- and whether they were fulfilled — so an order priced at zero is an
-- ordinary member of it, not an intruder.
--
-- What that buys, and why the separate table was the worse design:
--   • /welcome needs NO change. It grants by reading nclex_payments for
--     the email; a trial order is simply found there.
--   • The grant is ONE LINE in activate.ts (the `source` ternary in
--     insertBankSubscriptionOnce). Expiry already computes from the
--     product's duration_days; cat_allowance already snapshots.
--   • Idempotency is INHERITED. nclex_subscriptions' unique index on
--     payment_id already makes a double-click or a re-clicked setup link
--     grant exactly once. The separate table would have had to build it.
--   • The receipt email already varies by state and already prints
--     "Bank access until <date>" off the subscription — the one sentence
--     a trial email most needs.
--
-- ⚠ BANK_TRIAL is its own purpose, NOT BANK_PURCHASE at amount 0.
-- A trial recorded as a purchase reads as revenue in every report that
-- does not know to check the amount. Its own value makes excluding it a
-- one-word filter, and makes "how many trials started this month?"
-- countable without the heuristic `amount_minor = 0`.
--
-- ⚠ The trial NEVER goes to Paystack. Its row is written already PAID
-- (no INIT, no reference, no verify step), which is why it needs a
-- collection_channel that is neither PAYSTACK nor OFF_PLATFORM — the
-- latter specifically means a tutor recorded cash, so reusing it would
-- be false.

-- ── 1. BANK_TRIAL joins the purpose enum ─────────────────────────────
ALTER TABLE nclex_payments
  DROP CONSTRAINT nclex_payments_purpose_check;
ALTER TABLE nclex_payments
  ADD CONSTRAINT nclex_payments_purpose_check
  CHECK (purpose IN ('BANK_PURCHASE','READINESS_PURCHASE',
    'PROGRAMME_INITIAL','PROGRAMME_INSTALLMENT','BANK_OPTIN_AT_PROGRAMME',
    'BANK_TRIAL'));

-- ── 2. …and to the product-vs-programme target rule ──────────────────
-- A trial carries a product (NCLEX_TRIAL) and no programme, exactly like
-- the other bank purposes.
--
-- ⓘ Two neighbouring constraints need no change and are left alone:
-- _programme_only_fields already passes any non-programme purpose
-- (strategy_id + installment_index stay NULL), and _cohort_scope already
-- refuses a cohort_id on anything but PROGRAMME_INITIAL.
ALTER TABLE nclex_payments
  DROP CONSTRAINT nclex_payments_purpose_target;
ALTER TABLE nclex_payments
  ADD CONSTRAINT nclex_payments_purpose_target CHECK (
    (purpose IN ('PROGRAMME_INITIAL','PROGRAMME_INSTALLMENT')
      AND programme_id IS NOT NULL AND product_id IS NULL)
    OR (purpose IN ('BANK_PURCHASE','READINESS_PURCHASE','BANK_OPTIN_AT_PROGRAMME','BANK_TRIAL')
      AND product_id IS NOT NULL AND programme_id IS NULL)
  );

-- ── 3. A third collection channel ────────────────────────────────────
-- NONE = nothing was collected, by design. Distinct from OFF_PLATFORM,
-- which asserts that money WAS collected, just not by us.
ALTER TABLE nclex_payments
  DROP CONSTRAINT nclex_payments_collection_channel_check;
ALTER TABLE nclex_payments
  ADD CONSTRAINT nclex_payments_collection_channel_check
  CHECK (collection_channel IN ('PAYSTACK','OFF_PLATFORM','NONE'));

COMMENT ON COLUMN nclex_payments.collection_channel IS
  'PAYSTACK = money into Quademia via Paystack. OFF_PLATFORM = a tutor recorded a cash/transfer they collected. NONE = nothing was collected by design (the free trial).';

-- ── 4. The guard, layer 1: one trial per EMAIL, ever ─────────────────
-- ⭐ THE ORDER ROW IS ALSO THE GUARD. Before an account exists the email
-- is the only identity we hold, so the trial order doubles as the record
-- of "this address has had its trial" — which is the whole job the
-- rejected nclex_trial_requests table was invented to do.
--
-- ⚠ Deliberately NOT filtered by status. "One trial EVER", not "one
-- ACTIVE trial" — otherwise the pass expires, the student asks again,
-- and the bank is free forever.
--
-- ⓘ Consequence for the app layer, handled in lib/payments/trial.ts: a
-- guest whose setup email never arrived must be able to ask again. That
-- is a RESEND of the existing order's link, never a second row — this
-- index is what forces that to be built correctly rather than
-- discovered later.
CREATE UNIQUE INDEX idx_nclex_payments_one_trial_per_email
  ON nclex_payments (lower(email))
  WHERE purpose = 'BANK_TRIAL';

-- ── 5. The guard, layer 2: one trial per ACCOUNT, ever ───────────────
-- The layered-enforcement rule (CLAUDE.md → lib/access): layer 1 keys on
-- the email because that is all a guest has; this one keys on the account
-- once there is one. It catches what layer 1 cannot — the same person
-- arriving on a second address and landing, via Supabase's automatic
-- identity linking, in an account that already spent its trial.
CREATE UNIQUE INDEX idx_nclex_subscriptions_one_trial_per_user
  ON nclex_subscriptions (user_id)
  WHERE source = 'SELF_TRIAL_SIGNUP';
