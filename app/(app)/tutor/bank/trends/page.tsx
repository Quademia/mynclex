// mynclex/app/(app)/tutor/bank/trends/page.tsx
//
// Tutor twin of /admin/bank/trends. Reads the tutor tables filtered by
// tutor_id and hands rows to the shared TrendsListClient (filter bar +
// content search + filtered table).
//
// ⭐ That .eq('tutor_id', user.id) is the whole reason this page was
// correct while its neighbour /tutor/bank/all was not: RLS does NOT
// enforce it DB-side for a SUPER_ADMIN, whose FOR-ALL policy matches
// every row, and requireBankCurator('tutor') admits SUPER_ADMIN on
// purpose. Do not remove the filter as redundant — it is the control.
// See lib/bank/tutor-scope.ts.

import Link from 'next/link';
import { requireBankCurator } from '@/lib/access';
import { richTextToPlain } from '@/lib/authoring/rich-doc';
import { createTrendAction } from '@/lib/bank/wrappers/trend/actions';
import { loadAuthorship } from '@/lib/audit/authorship';
import {
  TrendsListClient,
  type TrendListRow,
} from '@/lib/bank/wrappers/trend/trends-list-client';

export const dynamic = 'force-dynamic';

interface TrendDbRow {
  trend_id:     string;
  title:        string;
  scenario:     string | null;
  tags:         string[] | null;
  is_published: boolean;
  updated_at:   string;
}

interface AttachedQuestionRow { trend_id: string | null; is_published: boolean }

export default async function TutorTrendsV2ListPage() {
  const { supabase, user } = await requireBankCurator('tutor');

  const { data: trendRows, error: trendErr } = await supabase
    .from('nclex_tutor_trend_datasets')
    .select('trend_id, title, scenario, tags, is_published, updated_at')
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

  const trends = (trendRows ?? []) as TrendDbRow[];
  const ids = trends.map((t) => t.trend_id);

  const attachedStats: Record<string, { total: number; published: number }> = {};
  if (ids.length > 0) {
    const { data: itemRows } = await supabase
      .from('nclex_tutor_questions')
      .select('trend_id, is_published')
      .in('trend_id', ids);
    for (const row of (itemRows ?? []) as AttachedQuestionRow[]) {
      if (!row.trend_id) continue;
      const s = (attachedStats[row.trend_id] ??= { total: 0, published: 0 });
      s.total += 1;
      if (row.is_published) s.published += 1;
    }
  }

  const authorship = await loadAuthorship(supabase, 'tutor', 'tutor_trend_dataset', ids);

  const rows: TrendListRow[] = trends.map((t) => ({
    trend_id:     t.trend_id,
    title:        t.title,
    scenario:     t.scenario,
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
              <span className="bl-surface-chip tutor"><span className="dot" />Tutor bank</span>
              Wrapper · trends
            </div>
            <h1 className="bl-page-title">Trend datasets</h1>
            <p className="bl-page-sub">
              Your private multi-chart clinical data panels that attach to bank
              questions. A published dataset with no live question reaches nobody.
            </p>
          </div>
          <div className="bl-head-actions">
            <Link href="/tutor" className="bl-btn">← Tutor</Link>
            <Link href="/tutor/bank/all" className="bl-btn">All questions →</Link>
            <Link href="/tutor/bank/cases" className="bl-btn">Case Studies →</Link>
          </div>
        </header>

        {rows.length === 0 ? (
          <div className="auth-list-empty">
            <h3>No trend datasets yet</h3>
            <p>Click <strong>+ New trend dataset</strong> to create the first one.</p>
            <div style={{ marginTop: 12 }}>
              <NewTrendButton surface="tutor" />
            </div>
          </div>
        ) : (
          <TrendsListClient
            rows={rows}
            authorship={authorship}
            surface="tutor"
            newButton={<NewTrendButton surface="tutor" />}
          />
        )}
      </div>
    </main>
  );
}

// "+ New trend dataset" — a server-action form whose submit creates a
// draft and redirects to the editor (mirrors the case-study NewCaseButton).
// No kind picker: `kind` is just an editable label now, set in the editor.
function NewTrendButton({ surface }: { surface: 'admin' | 'tutor' }) {
  return (
    <form
      action={async (fd: FormData) => {
        'use server';
        await createTrendAction(fd);
      }}
      style={{ display: 'inline' }}
    >
      <input type="hidden" name="surface" value={surface} />
      <button type="submit" className="bl-btn bl-btn-primary">+ New trend dataset</button>
    </form>
  );
}

// Lowercased searchable blob: title + scenario + tags (substring search,
// tiny N). Scenario is rich content — flatten to plain text so the search
// matches prose, not Tiptap JSON. The chart-tab stimulus lives in a child
// table and isn't loaded here.
function buildTrendSearchText(t: TrendDbRow): string {
  return [t.title, richTextToPlain(t.scenario ?? ''), ...(t.tags ?? [])]
    .join(' ')
    .toLowerCase();
}
