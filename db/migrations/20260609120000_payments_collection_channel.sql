-- =========================================================
-- MyNclex — Payments: explicit collection channel (7d follow-up)
-- File: mynclex/db/migrations/20260609120000_payments_collection_channel.sql
-- =========================================================
-- Until now the only thing distinguishing a tutor's off-platform "mark
-- installment paid" row from a real Paystack payment was paystack_reference
-- being NULL — an implicit, accidental signal. This makes it explicit so
-- "money QAcademy actually collected" vs "money a tutor collected directly"
-- is a filterable fact, with an audit trail of who recorded it.
--
--   • collection_channel  — PAYSTACK (money into QAcademy via Paystack) or
--                           OFF_PLATFORM (tutor recorded a cash/transfer).
--   • recorded_by_user_id — the tutor who recorded an off-platform payment;
--                           NULL for Paystack rows (enforced by a CHECK).
--
-- Backfill: every real payment carries a Paystack reference (set at INIT), so
-- the only referenceless rows are off-platform mark-paid entries — classify
-- by that. On prod (no off-platform rows yet) this leaves everything PAYSTACK.

ALTER TABLE nclex_payments
  ADD COLUMN collection_channel  TEXT NOT NULL DEFAULT 'PAYSTACK',
  ADD COLUMN recorded_by_user_id UUID;

ALTER TABLE nclex_payments
  ADD CONSTRAINT nclex_payments_collection_channel_check
    CHECK (collection_channel IN ('PAYSTACK', 'OFF_PLATFORM')),
  -- recorded_by only makes sense on an off-platform row.
  ADD CONSTRAINT nclex_payments_recorded_by_scope
    CHECK (recorded_by_user_id IS NULL OR collection_channel = 'OFF_PLATFORM'),
  ADD CONSTRAINT nclex_payments_recorded_by_fkey
    FOREIGN KEY (recorded_by_user_id) REFERENCES nclex_users(id) ON DELETE SET NULL;

UPDATE nclex_payments
  SET collection_channel = 'OFF_PLATFORM'
  WHERE paystack_reference IS NULL;

-- Reconciliation reads filter on the channel.
CREATE INDEX IF NOT EXISTS idx_nclex_payments_channel
  ON nclex_payments (collection_channel);
