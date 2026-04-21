// mynclex/app/(app)/admin/payments/page.tsx
//
// Admin Payments — placeholder.
//
// Gated on PAYMENTS_MANAGE permission (SUPER_ADMIN bypasses via the
// nclex_user_has_permission() helper's short-circuit). Plain admins
// won't see the section card on /admin until PAYMENTS_MANAGE is
// granted, and direct URL navigation without the permission bounces
// them back to /admin.
//
// Today: placeholder only — no schema, no data. The real payments UI
// (transaction list, refund flow, tutor payout tracking) lands once
// nclex_products / nclex_payments and the MyNclex payment worker are
// in place.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminPaymentsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [rolesRes, permsRes] = await Promise.all([
    supabase.from('nclex_user_roles').select('role').eq('user_id', user.id),
    supabase
      .from('nclex_admin_permissions')
      .select('permission')
      .eq('user_id', user.id),
  ]);

  const roles = (rolesRes.data ?? []).map((r) => r.role as string);
  const permissions = (permsRes.data ?? []).map((p) => p.permission as string);

  const canManagePayments =
    roles.includes('SUPER_ADMIN') || permissions.includes('PAYMENTS_MANAGE');

  if (!canManagePayments) {
    redirect('/admin');
  }

  return (
    <main className="dash-main">
      <section className="dash-card">
        <div className="dash-header">
          <div className="bank-header-row">
            <Link href="/admin" className="bank-back-link">
              ← Admin
            </Link>
          </div>
          <h1 className="dash-title">Payments</h1>
          <p className="dash-subtitle">
            Transaction review, refunds, and tutor payouts.
          </p>
        </div>

        <div className="dash-note">
          <strong>Not built yet.</strong> This section exists so the
          permission gate can be wired ahead of the real payments UI.
          When `nclex_products`, `nclex_payments`, and the MyNclex
          payment worker land, this page will show:
          <ul className="payments-placeholder-list">
            <li>Transaction list with filters (status, amount, date, product).</li>
            <li>Refund flow with an audit trail.</li>
            <li>Tutor-payout status per programme.</li>
            <li>Per-transaction detail drill-down.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
