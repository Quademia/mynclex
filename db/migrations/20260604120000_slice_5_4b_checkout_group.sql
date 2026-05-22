-- =========================================================
-- MyNclex — Payments Slice 5.4b: checkout groups (combined charge)
-- File: mynclex/db/migrations/20260604120000_slice_5_4b_checkout_group.sql
-- =========================================================
-- The bank opt-in at programme checkout lets a student buy a programme AND
-- a bank pack in ONE Paystack charge. We keep the one-purpose-per-row
-- ledger (a programme row + a bank row), but tie them to a single charge
-- with a shared checkout_group_id and a shared paystack_reference.
--
-- This is why paystack_reference can no longer be UNIQUE per row: the two
-- (future: N) line items of one order legitimately share the one charge's
-- reference. Uniqueness of a charge is guaranteed by how we generate the
-- reference (MNX_<random>) + the group id; the verify path now loads the
-- whole group by reference and checks Paystack's amount against the SUM of
-- the group's rows.
--
-- checkout_group_id is the durable order-grouping key (our concept, not
-- Paystack's) — every row gets one, single-item orders included, so the
-- verify/activate code has a single uniform "operate on the group" path.
-- A volatile default backfills every existing row with its own group.

ALTER TABLE nclex_payments
  ADD COLUMN checkout_group_id UUID NOT NULL DEFAULT gen_random_uuid();

-- Rows of one order share a reference now — drop the per-row UNIQUE and
-- keep a plain lookup index. (App-side generation keeps references
-- collision-free across distinct charges.)
ALTER TABLE nclex_payments
  DROP CONSTRAINT nclex_payments_paystack_reference_key;

CREATE INDEX idx_nclex_payments_reference ON nclex_payments (paystack_reference);
CREATE INDEX idx_nclex_payments_group     ON nclex_payments (checkout_group_id);
