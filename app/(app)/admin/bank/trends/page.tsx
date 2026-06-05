// mynclex/app/(app)/admin/bank/trends/page.tsx
//
// Admin Trend datasets list. Loads nclex_trend_datasets + a per-dataset
// attached-question breakdown + authorship + a searchable text blob
// (scenario + the dataset rows/timepoints), then hands everything to the
// shared TrendsListClient (filter bar + filtered table).

import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import { kindDefaultLabel } from '@/lib/bank/wrappers/trend/kind-templates';
import { KindPickerLauncher } from '@/lib/bank/wrappers/trend/kind-picker-modal';
import { loadAuthorship } from '@/lib/audit/authorship';
import {
  TrendsListClient,
  type TrendListRow,
} from '@/lib/bank/wrappers/trend/trends-list-client';

export const dynamic = 'force-dynamic';

interface TrendDbRow {
  trend_id:     string;
  title:        string;
  kind:         string;
  scenario:     string | null;
  row_label:    string | null;
  rows:         unknown;
  timepoints:   unknown;
  is_published: boolean;
  updated_at:   string;
}

interface AttachedQuestionRow { trend_id: string | null; is_published: boolean }

export default async function AdminTrendsV2ListPage() {
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  const { data: trendRows, error: trendErr } = await supabase
    .from('nclex_trend_datasets')
    .select('trend_id, title, kind, scenario, row_label, rows, timepoints, is_published, updated_at')
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

  const trends = (trendRows ?? []) as TrendDbRow[];
  const ids = trends.map((t) => t.trend_id);

  const attachedStats: Record<string, { total: number; published: number }> = {};
  if (ids.length > 0) {
    const { data: itemRows } = await supabase
      .from('nclex_bank_items')
      .select('trend_id, is_published')
      .in('trend_id', ids);
    for (const row of (itemRows ?? []) as AttachedQuestionRow[]) {
      if (!row.trend_id) continue;
      const s = (attachedStats[row.trend_id] ??= { total: 0, published: 0 });
      s.total += 1;
      if (row.is_published) s.published += 1;
    }
  }

  const authorship = await loadAuthorship(supabase, 'admin', 'trend_dataset', ids);

  const rows: TrendListRow[] = trends.map((t) => ({
    trend_id:     t.trend_id,
    title:        t.title,
    scenario:     t.scenario,
    kind:         t.kind,
    kindLabel:    kindDefaultLabel(t.kind),
    is_published: t.is_published,
    updated_at:   t.updated_at,
    total:        attachedStats[t.trend_id]?.total ?? 0,
    published:    attachedStats[t.trend_id]?.published ?? 0,
    searchText:   buildTrendSearchText(t),
  }));

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner">
        <header className="bl-page-head">
          <div>
            <div className="bl-eyebrow">
              <span className="bl-surface-chip admin"><span className="dot" />Admin bank</span>
              Wrapper · trends
            </div>
            <h1 className="bl-page-title">Trend datasets</h1>
            <p className="bl-page-sub">
              Time-series data panels (rows × timepoints) that attach to bank
              questions. A published dataset with no live question reaches nobody.
            </p>
          </div>
        </header>

        {rows.length === 0 ? (
          <div className="auth-list-empty">
            <h3>No trend datasets yet</h3>
            <p>Click <strong>+ New trend dataset</strong> to create the first one.</p>
            <div style={{ marginTop: 12 }}>
              <KindPickerLauncher surface="admin" triggerClassName="bl-btn bl-btn-primary" />
            </div>
          </div>
        ) : (
          <TrendsListClient
            rows={rows}
            authorship={authorship}
            surface="admin"
            newButton={<KindPickerLauncher surface="admin" triggerClassName="bl-btn bl-btn-primary" />}
          />
        )}
      </div>
    </main>
  );
}

// Lowercased searchable blob: title + scenario + row label + the dataset
// rows/timepoints (JSON-flattened — substring search, tiny N).
function buildTrendSearchText(t: TrendDbRow): string {
  const parts: string[] = [t.title, t.scenario ?? '', t.row_label ?? ''];
  if (t.rows) parts.push(JSON.stringify(t.rows));
  if (t.timepoints) parts.push(JSON.stringify(t.timepoints));
  return parts.join(' ').toLowerCase();
}
