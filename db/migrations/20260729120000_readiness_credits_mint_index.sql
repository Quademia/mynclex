-- mynclex/db/migrations/20260729120000_readiness_credits_mint_index.sql
--
-- Readiness student Slice ②a.2 — the mint's idempotency key.
--
-- A payment mints N credit rows (BANK_90D → 2, READINESS_SELECT3 → 3),
-- so — unlike a subscription, which is one-per-payment and guarded by a
-- UNIQUE(payment_id) index — the credits table has no natural key to
-- stop a DOUBLE activation from minting twice. The activation callback
-- can fire more than once (a page refresh), and the grant runs BEFORE
-- the payment is flipped to ACTIVATED, so the flip doesn't serialise it
-- either. Two concurrent runs would each mint N → the student gets 2N
-- credits they didn't pay for.
--
-- Fix: give each minted row an ordinal within its payment (1..N) and a
-- UNIQUE(payment_id, mint_index). A re-run's batch insert conflicts on
-- mint_index 1 and rolls back atomically → activate.ts treats the 23505
-- as "already minted". ADMIN_GRANT credits carry no payment_id and no
-- mint_index — the index is partial, and the CHECK requires mint_index
-- exactly when a payment is present.

ALTER TABLE nclex_readiness_credits
  ADD COLUMN mint_index SMALLINT;

-- Present iff the credit came from a payment (the idempotency key). NULL
-- for admin grants, which need no per-payment dedup.
ALTER TABLE nclex_readiness_credits
  ADD CONSTRAINT nclex_readiness_credits_mint_index_scope
  CHECK ((payment_id IS NULL) = (mint_index IS NULL));

CREATE UNIQUE INDEX idx_nclex_readiness_credits_payment_mint
  ON nclex_readiness_credits (payment_id, mint_index)
  WHERE payment_id IS NOT NULL;
