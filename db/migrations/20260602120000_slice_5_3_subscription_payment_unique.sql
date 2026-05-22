-- =========================================================
-- MyNclex — Payments Slice 5.3: one subscription per payment
-- File: mynclex/db/migrations/20260602120000_slice_5_3_subscription_payment_unique.sql
-- =========================================================
-- Activation must be idempotent: a payment grants AT MOST one bank
-- subscription, no matter how many times the callback page is hit (or
-- hit concurrently). A TS-only pre-check races; this DB-level partial
-- unique index is the real guarantee. payment_id is nullable (trial /
-- admin grants carry none), so the index is partial.
--
-- Surfaced during 5.3 testing: concurrent callback loads created
-- duplicate subscriptions for the same payment.

CREATE UNIQUE INDEX idx_nclex_subscriptions_payment
  ON nclex_subscriptions (payment_id)
  WHERE payment_id IS NOT NULL;
