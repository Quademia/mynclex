-- =========================================================
-- MyNclex — Payments Slice 5.1: catalogue + payments + subscriptions
--           + a runtime config table
-- File: mynclex/db/migrations/20260601120000_slice_5_1_payments_schema.sql
-- =========================================================
-- Source of truth: docs/product-plan/design-handoff/payments-and-enrolment/
--   index.html (adopted schema basis) + docs/product-plan/
--   payments-and-enrolment.md (pricing). DB-only slice — no Paystack
--   wiring yet (that's 5.2/5.3).
--
-- Four tables:
--   1. nclex_config       — key/value runtime constants (gamma `config`
--                           pattern). Seeded with the bank-opt-in
--                           discount so it's retunable without a redeploy
--                           (the CD proposal held it as a client-side
--                           constant; we move it here on purpose).
--   2. nclex_products     — QAcademy's buyable SKU catalogue (bank
--                           durations, trial; readiness SKUs expressible
--                           but NOT seeded — no purchase path in v1).
--                           Dual-currency by column because the bank is
--                           deliberately priced regionally.
--   3. nclex_payments     — audit trail, one row per Paystack txn.
--                           Polymorphic single-purpose rows (a `purpose`
--                           enum + exactly one of product_id/programme_id)
--                           — NOT a header + line-item child table.
--   4. nclex_subscriptions— bank + readiness entitlements only. Programme
--                           access is the nclex_enrolments row, never a
--                           subscription. Stacks (new row per purchase;
--                           access = max(end_at)), never mutate-extend.
--
-- strategy_id on nclex_payments points at nclex_programme_payment_
-- strategies, which lands in Slice 7 — so it is a bare nullable UUID
-- here (no FK yet). Upfront-full reads the price from
-- nclex_programmes.price_minor (Slice 3a), so nothing references a
-- strategy row in v1.
--
-- Write paths: nclex_payments / nclex_subscriptions are written only by
-- the (service-role) checkout route handlers in 5.2/5.3 — the service
-- role bypasses RLS, so there are deliberately NO authenticated
-- INSERT/UPDATE policies on them. SUPER_ADMIN gets a read/manage policy
-- for tooling + manual grants.


-- =========================================================
-- 1. nclex_config — runtime-tunable constants
-- =========================================================
-- key/value/description, mirroring gamma's `config` table. value is TEXT;
-- the reader parses it (e.g. ::numeric for the discount). Read is PUBLIC
-- because the first consumer (bank-opt-in discount) is shown on the
-- public, guest-accessible programme checkout. Convention (same as
-- gamma): NON-SECRET tunable constants only — no keys, no worker URLs.

CREATE TABLE nclex_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE nclex_config ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anon guest checkout) may read config values.
CREATE POLICY nclex_config_public_select
  ON nclex_config FOR SELECT
  USING (true);

-- Only SUPER_ADMIN may change them (no admin UI in v1 — UPDATE by hand).
CREATE POLICY nclex_config_admin_write
  ON nclex_config FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));

INSERT INTO nclex_config (key, value, description) VALUES
  ('bank_optin_discount', '0.40',
   'Bank opt-in discount at programme checkout — fraction off the standalone bank price (0.40 = 40% off).');


-- =========================================================
-- 2. nclex_products — buyable QAcademy SKU catalogue
-- =========================================================
-- Bank durations, readiness SKUs, trial. NOT programme fees (those are
-- the tutor's, on nclex_programmes / payment-strategies). Dual-currency
-- by column; the reader picks the column for the buyer's currency.

CREATE TABLE nclex_products (
  product_id            TEXT PRIMARY KEY,                       -- slug: BANK_30D, READINESS_ALL5, NCLEX_TRIAL
  name                  TEXT NOT NULL,                          -- display label
  kind                  TEXT NOT NULL DEFAULT 'PAID'
                        CHECK (kind IN ('PAID','TRIAL')),       -- no FREE
  pack_type             TEXT NOT NULL
                        CHECK (pack_type IN ('BANK_DURATION','READINESS','TRIAL')),
  duration_days         INTEGER,                                -- NULL for readiness (21-day clock starts on activation)
  readiness_pack_count  SMALLINT,                               -- READINESS SKUs only — 1/3/5; how many packs this readiness SKU grants
  bundled_readiness_credits SMALLINT NOT NULL DEFAULT 0,        -- BANK_DURATION only — free readiness credits granted with the pass (60d→1 … 365d→5)
  price_minor_ghs       INTEGER NOT NULL DEFAULT 0,             -- minor units (pesewas); trial = 0
  price_minor_usd       INTEGER NOT NULL DEFAULT 0,             -- minor units (cents); trial = 0
  status                TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE','ARCHIVED')),
  sort_order            SMALLINT NOT NULL DEFAULT 0,            -- landing-page display order
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Landing-page query: active SKUs in display order.
CREATE INDEX idx_nclex_products_status_sort
  ON nclex_products (status, sort_order);

ALTER TABLE nclex_products ENABLE ROW LEVEL SECURITY;

-- Public reads ACTIVE SKUs (the landing page + checkout). Archived rows
-- stay readable to admins for historical payments.
CREATE POLICY nclex_products_public_select
  ON nclex_products FOR SELECT
  USING (status = 'ACTIVE');

CREATE POLICY nclex_products_admin_all
  ON nclex_products FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));

-- Seed: free 7-day trial + 5 paid bank duration packs (prices from
-- payments-and-enrolment.md §247 / §287). Readiness SKUs are NOT seeded
-- — the readiness purchase path is a v2 deferral.
-- bundled_readiness_credits per tier from payments-and-enrolment.md §396
-- (Trial/30d → 0, 60d → 1, 90d → 2, 180d → 3, 365d → 5).
INSERT INTO nclex_products
  (product_id, name, kind, pack_type, duration_days, bundled_readiness_credits, price_minor_ghs, price_minor_usd, sort_order)
VALUES
  ('NCLEX_TRIAL', '7-day Trial',         'TRIAL', 'TRIAL',          7, 0,     0,     0, 0),
  ('BANK_30D',    '30 days bank access', 'PAID',  'BANK_DURATION',  30, 0, 12000,  3000, 1),
  ('BANK_60D',    '60 days bank access', 'PAID',  'BANK_DURATION',  60, 1, 20000,  5000, 2),
  ('BANK_90D',    '90 days bank access', 'PAID',  'BANK_DURATION',  90, 2, 27000,  7000, 3),
  ('BANK_180D',   '180 days bank access','PAID',  'BANK_DURATION', 180, 3, 45000, 11000, 4),
  ('BANK_365D',   '365 days bank access','PAID',  'BANK_DURATION', 365, 5, 70000, 16000, 5);


-- =========================================================
-- 3. nclex_payments — Paystack audit trail (one row per txn)
-- =========================================================
-- Polymorphic: a `purpose` enum + exactly one of product_id/programme_id.
-- Created INIT before the redirect to Paystack; flips PAID on verify,
-- ACTIVATED once the entitlement/enrolment is granted. Off-platform
-- (tutor-added) enrolments never touch this table.

CREATE TABLE nclex_payments (
  payment_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  paystack_reference    TEXT UNIQUE,                            -- set on /init; verified against on return

  -- NULL while pay-first (no account yet); set to the nclex_users row on
  -- verify. SET NULL (not CASCADE) so deleting a user keeps the financial
  -- audit row.
  user_id               UUID REFERENCES nclex_users(id) ON DELETE SET NULL,

  email                 TEXT NOT NULL,                          -- captured up front (dup-check + invite)

  purpose               TEXT NOT NULL
                        CHECK (purpose IN (
                          'BANK_PURCHASE','READINESS_PURCHASE',
                          'PROGRAMME_INITIAL','PROGRAMME_INSTALLMENT',
                          'BANK_OPTIN_AT_PROGRAMME'
                        )),

  -- Polymorphic target. Exactly one of these is set per row (CHECK below).
  product_id            TEXT REFERENCES nclex_products(product_id) ON DELETE RESTRICT,
  programme_id          UUID REFERENCES nclex_programmes(programme_id) ON DELETE RESTRICT,

  -- Programme-payment bookkeeping. strategy_id FK lands in Slice 7 (the
  -- strategies table) — bare nullable UUID here.
  strategy_id           UUID,
  enrolment_id          UUID REFERENCES nclex_enrolments(enrolment_id) ON DELETE SET NULL,
  installment_index     SMALLINT,                               -- PROGRAMME_INSTALLMENT only; 1-based

  currency              TEXT NOT NULL CHECK (currency IN ('GHS','USD')),  -- frozen at /init
  amount_minor          INTEGER NOT NULL,                       -- what Paystack was charged; frozen at /init

  status                TEXT NOT NULL DEFAULT 'INIT'
                        CHECK (status IN ('INIT','PAID','SETUP_REQUIRED','ACTIVATED','FAILED','REFUNDED')),

  paystack_payload_json JSONB,                                  -- raw response (debugging failed verifies)

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at               TIMESTAMPTZ,
  activated_at          TIMESTAMPTZ,

  -- Purpose ↔ target: programme purposes carry a programme (no product);
  -- bank/readiness purposes carry a product (no programme). Subsumes the
  -- "exactly one of (product_id, programme_id)" polymorphic rule.
  CONSTRAINT nclex_payments_purpose_target CHECK (
    (purpose IN ('PROGRAMME_INITIAL','PROGRAMME_INSTALLMENT')
       AND programme_id IS NOT NULL AND product_id IS NULL)
    OR
    (purpose IN ('BANK_PURCHASE','READINESS_PURCHASE','BANK_OPTIN_AT_PROGRAMME')
       AND product_id IS NOT NULL AND programme_id IS NULL)
  ),

  -- strategy_id + installment_index only make sense for programme rows.
  CONSTRAINT nclex_payments_programme_only_fields CHECK (
    purpose IN ('PROGRAMME_INITIAL','PROGRAMME_INSTALLMENT')
    OR (strategy_id IS NULL AND installment_index IS NULL)
  ),

  -- installment_index only for the installment purpose.
  CONSTRAINT nclex_payments_installment_index_scope CHECK (
    purpose = 'PROGRAMME_INSTALLMENT' OR installment_index IS NULL
  )
);

CREATE INDEX idx_nclex_payments_user       ON nclex_payments (user_id);
CREATE INDEX idx_nclex_payments_email      ON nclex_payments (email);
CREATE INDEX idx_nclex_payments_enrolment  ON nclex_payments (enrolment_id);
-- In-flight payments (verify / activation work queue).
CREATE INDEX idx_nclex_payments_open_status
  ON nclex_payments (status)
  WHERE status IN ('INIT','PAID','SETUP_REQUIRED');

ALTER TABLE nclex_payments ENABLE ROW LEVEL SECURITY;

-- Read: the owner (their own payments page) + SUPER_ADMIN. No
-- authenticated WRITE policy — writes happen only through the
-- service-role checkout handlers (service role bypasses RLS).
CREATE POLICY nclex_payments_owner_select
  ON nclex_payments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'));


-- =========================================================
-- 4. nclex_subscriptions — bank + readiness entitlements
-- =========================================================
-- One row per granted entitlement. Programme access is NOT here (it's the
-- enrolment row). Stacks: two active rows → access runs to max(end_at).

CREATE TABLE nclex_subscriptions (
  subscription_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id                UUID NOT NULL REFERENCES nclex_users(id) ON DELETE CASCADE,
  product_id             TEXT NOT NULL REFERENCES nclex_products(product_id) ON DELETE RESTRICT,
  pack_type              TEXT NOT NULL                          -- denormalised for cheap entitlement reads
                         CHECK (pack_type IN ('BANK_DURATION','READINESS','TRIAL')),

  source                 TEXT NOT NULL
                         CHECK (source IN ('SELF_PURCHASE','PROGRAMME_OPTIN','SELF_TRIAL_SIGNUP','ADMIN_GRANT')),

  status                 TEXT NOT NULL DEFAULT 'ACTIVE'
                         CHECK (status IN ('ACTIVE','EXPIRED','REVOKED')),  -- cron flips ACTIVE→EXPIRED past end_at

  started_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_at                 TIMESTAMPTZ,                           -- started_at + duration_days; NULL for unactivated readiness

  -- READINESS only: which of the 5 packs was claimed + when the student
  -- pressed "Start" (begins the 21-day clock). Unused in v1.
  readiness_pack_id      TEXT REFERENCES nclex_readiness_packs(pack_id) ON DELETE RESTRICT,
  readiness_activated_at TIMESTAMPTZ,

  payment_id             UUID REFERENCES nclex_payments(payment_id) ON DELETE RESTRICT,  -- NULL for trial / admin grant
  granted_by             UUID REFERENCES nclex_users(id) ON DELETE SET NULL,             -- ADMIN_GRANT only

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Entitlement reads (does this user have active bank access?).
CREATE INDEX idx_nclex_subscriptions_user_status
  ON nclex_subscriptions (user_id, status);
-- Cron expiry sweep.
CREATE INDEX idx_nclex_subscriptions_expiry
  ON nclex_subscriptions (end_at)
  WHERE status = 'ACTIVE';

ALTER TABLE nclex_subscriptions ENABLE ROW LEVEL SECURITY;

-- Read: the owner + SUPER_ADMIN. Writes via service-role handlers; the
-- admin_all policy also lets SUPER_ADMIN make manual grants.
CREATE POLICY nclex_subscriptions_owner_select
  ON nclex_subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'));

CREATE POLICY nclex_subscriptions_admin_all
  ON nclex_subscriptions FOR ALL
  TO authenticated
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));
