// mynclex/app/(app)/admin/trends/page.tsx
//
// Admin Trend datasets list (Slice 1.12a). Table of dataset rows
// sorted by updated_at DESC. Header has "Trend datasets" title +
// a "+ New trend" button linking to /admin/trends/new (which is
// itself a minimal create form — keeping the first save simple
// so all heavy editing happens in the full editor).
//
// Role gate mirrors /admin/bank/cases: BANK_CURATE permission OR
// SUPER_ADMIN short-circuit. Failure redirects to /admin.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { TrendDatasetRow } from '@/lib/bank/trend/types';
import { kindDefaultLabel } from '@/lib/bank/trend/kind-templates';

export const dynamic = 'force-dynamic';

const BASE_URL = '/admin/trends';

export default async function AdminTrendsListPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [rolesRes, permsRes] = await Promise.all([
    supabase.from('nclex_user_roles').select('role').eq('user_id', user.id),
    supabase
      .from('nclex_admin_permissions')
      .select('permission')
      .eq('user_id', user.id),
  ]);

  const roles = (rolesRes.data ?? []).map((r) => r.role as string);
  const perms = (permsRes.data ?? []).map((p) => p.permission as string);

  const canCurate =
    roles.includes('SUPER_ADMIN') || perms.includes('BANK_CURATE');

  if (!canCurate) redirect('/admin');

  const params = await searchParams;

  const { data, error } = await supabase
    .from('nclex_trend_datasets')
    .select('trend_id, title, kind, is_published, updated_at, created_at')
    .order('updated_at', { ascending: false });

  if (error) {
    return (
      <main className="bank-page">
        <h1>Trend datasets</h1>
        <p className="bank-error">Error loading trends: {error.message}</p>
      </main>
    );
  }

  const trends = (data ?? []) as Array<Pick<
    TrendDatasetRow,
    'trend_id' | 'title' | 'kind' | 'is_published' | 'updated_at' | 'created_at'
  >>;

  return (
    <main className="bank-page">
      <div className="cs-list-head">
        <div>
          <h1>Trend datasets</h1>
          <p className="cs-list-sub">
            Time-series data panels (rows × timepoints) that attach to bank
            questions. In Slice 1.12a datasets stand alone; attachment to
            questions ships in 1.12b.
          </p>
        </div>
        <div className="cs-list-actions">
          <Link href="/admin/bank" className="cs-btn">← Back to bank</Link>
          <Link href={`${BASE_URL}/new`} className="cs-btn primary">+ New trend</Link>
        </div>
      </div>

      {params.saved === '1' && (
        <div className="cs-banner ok">Trend saved.</div>
      )}
      {params.deleted === '1' && (
        <div className="cs-banner ok">Trend deleted.</div>
      )}

      {trends.length === 0 ? (
        <div className="cs-list-empty">
          <h3>No trend datasets yet</h3>
          <p>Click <strong>+ New trend</strong> to create the first one.</p>
        </div>
      ) : (
        <table className="cs-list-table">
          <thead>
            <tr>
              <th>Trend ID</th>
              <th>Title</th>
              <th>Kind</th>
              <th>Status</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {trends.map((t) => (
              <tr key={t.trend_id}>
                <td><code>{t.trend_id}</code></td>
                <td>{t.title}</td>
                <td>{kindDefaultLabel(t.kind)}</td>
                <td>
                  {t.is_published
                    ? <span className="cs-pill ok">Published</span>
                    : <span className="cs-pill muted">Draft</span>}
                </td>
                <td>{new Date(t.updated_at).toLocaleDateString()}</td>
                <td>
                  <Link href={`${BASE_URL}/${t.trend_id}`} className="cs-btn">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
