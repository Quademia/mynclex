-- mynclex/db/migrations/20260723120000_products_rls_payments_manage.sql
--
-- Readiness student Slice ① (readiness-packs.md §12, re-cut
-- 2026-07-08) — align nclex_products RLS with the admin surface's
-- gate. The Products & Pricing page (and its nav entry) gate on
-- PAYMENTS_MANAGE, but the table's only manage policy was
-- SUPER_ADMIN — a PAYMENTS_MANAGE admin could neither write products
-- nor even SELECT ARCHIVED rows. One additive policy closes the gap
-- (policies OR together; the public ACTIVE-only read and the
-- SUPER_ADMIN policy are unchanged) — the layered-enforcement rule:
-- the SQL layer mirrors the TS gate.

CREATE POLICY nclex_products_payments_manage_all
  ON nclex_products FOR ALL
  TO authenticated
  USING (nclex_user_has_permission('PAYMENTS_MANAGE'))
  WITH CHECK (nclex_user_has_permission('PAYMENTS_MANAGE'));
