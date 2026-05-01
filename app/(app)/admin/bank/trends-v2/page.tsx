// mynclex/app/(app)/admin/bank/trends-v2/page.tsx
//
// Slice 13a — admin Trend datasets list (v2). Reads
// nclex_trend_datasets and renders a simple table. Each row links
// to the [trend_id] page (currently a stub; the real wrapper page
// lands in slice 13b).
//
// Companion to /admin/bank/trends/ (legacy list, kept working until
// the slice-14 swap). Reuses .auth-list-* styles from
// styles/authoring.css.

import Link from 'next/link';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import { kindDefaultLabel } from '@/lib/authoring/wrappers/trend/kind-templates';

export const dynamic = 'force-dynamic';

interface TrendRow {
  trend_id:     string;
  title:        string;
  kind:         string;
  is_published: boolean;
  updated_at:   string;
}

interface AttachedCount {
  trend_id: string;
  count:    number;
}

export default async function AdminTrendsV2ListPage() {
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  const { data: trendRows, error: trendErr } = await supabase
    .from('nclex_trend_datasets')
    .select('trend_id, title, kind, is_published, updated_at')
    .order('updated_at', { ascending: false });

  if (trendErr) {
    return (
      <main className="auth-list-page">
        <div className="auth-list-inner">
          <h1 className="auth-list-page-title">Trend datasets (v2)</h1>
          <p className="auth-sandbox-error">Could not load trends: {trendErr.message}</p>
        </div>
      </main>
    );
  }

  const trends = (trendRows ?? []) as TrendRow[];

  // Attached-question counts per dataset. Pull bank items where
  // trend_id matches any in this page and bucket in JS — small N.
  const attachedCounts: Record<string, number> = {};
  if (trends.length > 0) {
    const ids = trends.map((t) => t.trend_id);
    const { data: itemRows } = await supabase
      .from('nclex_bank_items')
      .select('trend_id')
      .in('trend_id', ids);
    for (const row of (itemRows ?? []) as AttachedCount[]) {
      if (row.trend_id) {
        attachedCounts[row.trend_id] = (attachedCounts[row.trend_id] ?? 0) + 1;
      }
    }
  }

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner">
        <header className="auth-list-page-header">
          <div>
            <h1 className="auth-list-page-title">Trend datasets (v2)</h1>
            <p className="auth-list-page-subtitle">
              Time-series data panels (rows × timepoints) that attach to bank
              questions. The wrapper page is rebuilt from scratch in slice 13 —
              click a row to open the v2 wrapper (stub until 13b).
            </p>
          </div>
          <div className="auth-list-toolbar">
            <Link href="/admin/bank/trends" className="auth-cs-btn subtle">← Legacy list</Link>
            <Link href="/admin/bank/trends-v2/new" className="auth-cs-btn primary">+ New trend dataset</Link>
          </div>
        </header>

        <p className="auth-list-count">{trends.length} dataset{trends.length === 1 ? '' : 's'}</p>

        {trends.length === 0 ? (
          <div className="auth-list-empty">
            <h3>No trend datasets yet</h3>
            <p>Click <strong>+ New trend dataset</strong> to create the first one.</p>
            <Link href="/admin/bank/trends-v2/new" className="auth-cs-btn primary" style={{ marginTop: 12 }}>
              + New trend dataset
            </Link>
          </div>
        ) : (
          <table className="auth-list-table">
            <thead>
              <tr>
                <th>Trend ID</th>
                <th>Title</th>
                <th>Kind</th>
                <th>Attached</th>
                <th>Status</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trends.map((t) => (
                <tr key={t.trend_id}>
                  <td className="auth-list-item-id"><code>{t.trend_id}</code></td>
                  <td>{t.title}</td>
                  <td>{kindDefaultLabel(t.kind)}</td>
                  <td>{attachedCounts[t.trend_id] ?? 0}</td>
                  <td>
                    {t.is_published
                      ? <span className="auth-cs-tag ok">Published</span>
                      : <span className="auth-cs-tag muted">Draft</span>}
                  </td>
                  <td>{new Date(t.updated_at).toLocaleDateString()}</td>
                  <td className="auth-list-row-actions">
                    <Link href={`/admin/bank/trends-v2/${t.trend_id}`} className="auth-cs-btn tiny">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
