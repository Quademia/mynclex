-- =========================================================
-- MyNclex — Payments Slice 7c: public payment-plans window
-- File: mynclex/db/migrations/20260607120000_slice_7c_public_payment_strategies.sql
-- =========================================================
-- The public checkout page needs to read a programme's *active* payment
-- plans to render the plan picker. 7a kept nclex_programme_payment_
-- strategies tutor-only (no public base-table policy); this slice adds the
-- public read the same way programmes do it (Slice 3b): a curated view
-- with owner rights (security_invoker = false, the default) + a GRANT to
-- anon, so guests at checkout can see active plans of PUBLISHED programmes
-- without opening the base table, whose RLS stays tutor-only.
--
-- Gate (single definition, here): the plan is active AND its programme is
-- PUBLISHED AND the tutor's account is active — mirrors
-- nclex_public_programmes. Inactive plans never surface to students.

BEGIN;

CREATE OR REPLACE VIEW nclex_public_payment_strategies AS
SELECT
  s.strategy_id,
  s.programme_id,
  s.kind,
  s.label,
  s.total_price_minor,
  s.initial_price_minor,
  s.installment_count,
  s.installment_interval_days,
  s.balance_due_days_after_enrolment,
  s.sort_order
FROM nclex_programme_payment_strategies s
JOIN nclex_programmes p ON p.programme_id = s.programme_id
JOIN nclex_users u ON u.id = p.tutor_id
WHERE s.is_active
  AND p.status = 'PUBLISHED'
  AND u.is_active;

GRANT SELECT ON nclex_public_payment_strategies TO anon, authenticated;

COMMIT;
