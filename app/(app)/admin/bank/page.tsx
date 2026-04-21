// mynclex/app/(app)/admin/bank/page.tsx
//
// Admin Question Bank — read-only listing (Bank Slice 1).
//
// Gated on BANK_CURATE permission (SUPER_ADMIN bypasses via the
// nclex_user_has_permission() helper's short-circuit). Users without
// that permission won't see the section card on /admin and will be
// bounced from this URL if they land here directly.
//
// Reads from nclex_bank_items under the `nclex_bank_items_curate_all`
// RLS policy — i.e. we see every row, drafts included. A plain
// authenticated user hitting the raw table would only see published
// rows (the read-published policy).
//
// Today: read-only table. Authoring (create/edit/delete), drill-down
// to a question detail page, filter chips, and pagination are all
// explicitly deferred to later slices.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminBankPage() {
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

  const canCurate =
    roles.includes('SUPER_ADMIN') || permissions.includes('BANK_CURATE');

  if (!canCurate) {
    redirect('/admin');
  }

  const { data: items, error } = await supabase
    .from('nclex_bank_items')
    .select(
      'item_id, question_type, difficulty, stem, is_published, is_free_sample, client_needs_category, tags, created_at',
    )
    .order('item_id', { ascending: true })
    .limit(200);

  const rows = items ?? [];
  const total = rows.length;
  const published = rows.filter((r) => r.is_published).length;
  const drafts = total - published;

  return (
    <main className="dash-main">
      <section className="dash-card dash-card--wide">
        <div className="dash-header">
          <div className="bank-header-row">
            <Link href="/admin" className="bank-back-link">
              ← Admin
            </Link>
          </div>
          <h1 className="dash-title">Question Bank</h1>
          <p className="dash-subtitle">
            {total} question{total === 1 ? '' : 's'} · {published} published ·{' '}
            {drafts} draft{drafts === 1 ? '' : 's'}
          </p>
        </div>

        {error ? (
          <div className="dash-note bank-error">
            <strong>Could not load questions.</strong> {error.message}
          </div>
        ) : rows.length === 0 ? (
          <div className="dash-note">
            <strong>No questions in the bank yet.</strong> Seeded content
            appears here once the dev seed has been applied.
          </div>
        ) : (
          <div className="bank-table-wrap">
            <table className="bank-table">
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th>Type</th>
                  <th>Difficulty</th>
                  <th>Stem</th>
                  <th>Category</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.item_id}>
                    <td className="bank-cell-id">{r.item_id}</td>
                    <td>
                      <span className="bank-badge bank-badge-type">
                        {r.question_type}
                      </span>
                    </td>
                    <td className="bank-cell-difficulty">
                      {r.difficulty ?? '—'}
                    </td>
                    <td className="bank-cell-stem" title={r.stem ?? ''}>
                      {r.stem}
                    </td>
                    <td className="bank-cell-category">
                      {r.client_needs_category ?? '—'}
                    </td>
                    <td>
                      {r.is_published ? (
                        <span className="bank-badge bank-badge-published">
                          Published
                        </span>
                      ) : (
                        <span className="bank-badge bank-badge-draft">
                          Draft
                        </span>
                      )}
                      {r.is_free_sample && (
                        <span className="bank-badge bank-badge-free">
                          Free sample
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="dash-note bank-footnote">
          <strong>Read-only for now.</strong> Authoring (create, edit,
          delete), question detail view, filter chips, and pagination
          land in later slices.
        </div>
      </section>
    </main>
  );
}
