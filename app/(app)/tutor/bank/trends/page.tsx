// mynclex/app/(app)/tutor/bank/trends/page.tsx
//
// Tutor Trend datasets list (Slice 1.12a). Tutor-scoped twin of the
// admin trends list — same shape, gated on the TUTOR role and
// filtered to tutor_id = auth.uid() (belt-and-braces; RLS also
// enforces this at the DB layer).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { TrendDatasetRow } from '@/lib/bank/trend/types';
import { kindDefaultLabel } from '@/lib/bank/trend/kind-templates';

export const dynamic = 'force-dynamic';

const BASE_URL = '/tutor/bank/trends';

export default async function TutorTrendsListPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: rolesData } = await supabase
    .from('nclex_user_roles')
    .select('role')
    .eq('user_id', user.id);

  const roles = (rolesData ?? []).map((r) => r.role as string);

  if (!roles.includes('TUTOR')) redirect('/no-access');

  const params = await searchParams;

  const { data, error } = await supabase
    .from('nclex_tutor_trend_datasets')
    .select('trend_id, title, kind, is_published, updated_at, created_at')
    .eq('tutor_id', user.id)
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
            Your private trend datasets. Attach them to tutor questions in
            Slice 1.12b.
          </p>
        </div>
        <div className="cs-list-actions">
          <Link href="/tutor/bank/all" className="cs-btn">← Back to bank</Link>
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
