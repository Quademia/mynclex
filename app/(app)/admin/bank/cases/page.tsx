// mynclex/app/(app)/admin/bank/cases/page.tsx
//
// Admin Case Studies list. Loads nclex_case_studies + a per-case
// published/draft question breakdown + authorship + a searchable text
// blob (scenario + chart tabs), then hands everything to the shared
// CasesListClient which renders the filter bar + filtered table.
//
// Reuses .auth-list-* styles from styles/authoring.css.

import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import { createCaseAction } from '@/lib/bank/wrappers/case-study/actions';
import { loadAuthorship } from '@/lib/audit/authorship';
import {
  CasesListClient,
  type CaseListRow,
} from '@/lib/bank/wrappers/case-study/cases-list-client';

export const dynamic = 'force-dynamic';

interface CaseDbRow {
  case_id:          string;
  title:            string;
  scenario_summary: string | null;
  topic:            string | null;
  subtopic:         string | null;
  tags:               string[] | null;
  is_published:       boolean;
  is_builder_visible: boolean;
  is_free_sample:     boolean;
  difficulty:         string | null;
  updated_at:         string;
}

interface CaseQuestionRow { parent_case_id: string | null; is_published: boolean }
interface TabRow { case_id: string; title: string | null; entries: unknown; columns_def: unknown }

export default async function AdminCasesV2ListPage() {
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  const { data: caseRows, error: caseErr } = await supabase
    .from('nclex_case_studies')
    .select('case_id, title, scenario_summary, topic, subtopic, tags, is_published, is_builder_visible, is_free_sample, difficulty, updated_at')
    .order('updated_at', { ascending: false });

  if (caseErr) {
    return (
      <main className="auth-list-page">
        <div className="auth-list-inner">
          <h1 className="auth-list-page-title">Case Studies</h1>
          <p className="auth-sandbox-error">Could not load cases: {caseErr.message}</p>
        </div>
      </main>
    );
  }

  const cases = (caseRows ?? []) as CaseDbRow[];
  const ids = cases.map((c) => c.case_id);

  // Per-case published/draft question breakdown.
  const slotStats: Record<string, { total: number; published: number }> = {};
  // Per-case chart-tab text (for the content search).
  const tabsByCase: Record<string, TabRow[]> = {};

  if (ids.length > 0) {
    const [{ data: qRows }, { data: tabRows }] = await Promise.all([
      supabase.from('nclex_bank_items').select('parent_case_id, is_published').in('parent_case_id', ids),
      supabase.from('nclex_case_study_tabs').select('case_id, title, entries, columns_def').in('case_id', ids),
    ]);
    for (const row of (qRows ?? []) as CaseQuestionRow[]) {
      if (!row.parent_case_id) continue;
      const s = (slotStats[row.parent_case_id] ??= { total: 0, published: 0 });
      s.total += 1;
      if (row.is_published) s.published += 1;
    }
    for (const t of (tabRows ?? []) as TabRow[]) {
      (tabsByCase[t.case_id] ??= []).push(t);
    }
  }

  const authorship = await loadAuthorship(supabase, 'admin', 'case_study', ids);

  const rows: CaseListRow[] = cases.map((c) => ({
    case_id:            c.case_id,
    title:              c.title,
    scenario:           c.scenario_summary,
    tabTitles:          (tabsByCase[c.case_id] ?? []).map((t) => t.title ?? '').filter(Boolean),
    is_published:       c.is_published,
    is_builder_visible: c.is_builder_visible,
    is_free_sample:     c.is_free_sample,
    difficulty:         c.difficulty,
    updated_at:         c.updated_at,
    total:          slotStats[c.case_id]?.total ?? 0,
    published:      slotStats[c.case_id]?.published ?? 0,
    searchText:     buildCaseSearchText(c, tabsByCase[c.case_id] ?? []),
  }));

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner">
        <header className="auth-list-page-header">
          <div>
            <h1 className="auth-list-page-title">Case Studies</h1>
            <p className="auth-list-page-subtitle">
              Multi-question NCLEX scenarios with a shared patient chart. Each
              case groups up to 6 questions under one scenario plus its chart
              tabs. Click a row to open the wrapper editor.
            </p>
          </div>
          <div className="auth-list-toolbar">
            <form
              action={async (fd: FormData) => {
                'use server';
                await createCaseAction(fd);
              }}
              style={{ display: 'inline' }}
            >
              <input type="hidden" name="surface" value="admin" />
              <button type="submit" className="auth-cs-btn primary">+ New case study</button>
            </form>
          </div>
        </header>

        {rows.length === 0 ? (
          <div className="auth-list-empty">
            <h3>No case studies yet</h3>
            <p>Click <strong>+ New case study</strong> to create the first one.</p>
          </div>
        ) : (
          <CasesListClient rows={rows} authorship={authorship} surface="admin" />
        )}
      </div>
    </main>
  );
}

// Lowercased searchable blob: title + scenario + topic/subtopic/tags +
// every chart tab's title and data. JSON.stringify is a pragmatic flatten
// for the chart entries (substring search; tiny N so cost is irrelevant).
function buildCaseSearchText(c: CaseDbRow, tabs: TabRow[]): string {
  const parts: string[] = [
    c.title, c.scenario_summary ?? '', c.topic ?? '', c.subtopic ?? '',
    ...(c.tags ?? []),
  ];
  for (const t of tabs) {
    parts.push(t.title ?? '');
    if (t.entries) parts.push(JSON.stringify(t.entries));
    if (t.columns_def) parts.push(JSON.stringify(t.columns_def));
  }
  return parts.join(' ').toLowerCase();
}
