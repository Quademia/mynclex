// mynclex/app/(app)/tutor/bank/trends/page.tsx
//
// Slice 13a — tutor twin of /admin/bank/trends. Reads
// nclex_tutor_trend_datasets filtered by tutor_id (RLS also enforces
// at the DB layer; client filter is belt-and-braces). Each row
// links to the [trend_id] stub (real wrapper lands in 13b).

import Link from 'next/link';
import { requireBankCurator } from '@/lib/access';
import { kindDefaultLabel } from '@/lib/bank/wrappers/trend/kind-templates';
import { KindPickerLauncher } from '@/lib/bank/wrappers/trend/kind-picker-modal';

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

export default async function TutorTrendsV2ListPage() {
  const { supabase, user } = await requireBankCurator('tutor');

  const { data: trendRows, error: trendErr } = await supabase
    .from('nclex_tutor_trend_datasets')
    .select('trend_id, title, kind, is_published, updated_at')
    .eq('tutor_id', user.id)
    .order('updated_at', { ascending: false });

  if (trendErr) {
    return (
      <main className="auth-list-page">
        <div className="auth-list-inner">
          <h1 className="auth-list-page-title">Trend datasets</h1>
          <p className="auth-sandbox-error">Could not load trends: {trendErr.message}</p>
        </div>
      </main>
    );
  }

  const trends = (trendRows ?? []) as TrendRow[];

  const attachedCounts: Record<string, number> = {};
  if (trends.length > 0) {
    const ids = trends.map((t) => t.trend_id);
    const { data: itemRows } = await supabase
      .from('nclex_tutor_questions')
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
            <h1 className="auth-list-page-title">Trend datasets</h1>
            <p className="auth-list-page-subtitle">
              Your private time-series data panels (rows × timepoints) that
              attach to bank questions. Click a row to open the wrapper editor.
            </p>
          </div>
          <div className="auth-list-toolbar">
            <KindPickerLauncher surface="tutor" />
          </div>
        </header>

        <p className="auth-list-count">{trends.length} dataset{trends.length === 1 ? '' : 's'}</p>

        {trends.length === 0 ? (
          <div className="auth-list-empty">
            <h3>No trend datasets yet</h3>
            <p>Click <strong>+ New trend dataset</strong> to create the first one.</p>
            <div style={{ marginTop: 12 }}>
              <KindPickerLauncher surface="tutor" />
            </div>
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
                    <Link href={`/tutor/bank/trends/${t.trend_id}`} className="auth-cs-btn tiny">
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
