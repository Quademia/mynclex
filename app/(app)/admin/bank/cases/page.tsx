// mynclex/app/(app)/admin/bank/cases/page.tsx
//
// Admin Case Studies list. Loads nclex_case_studies + a per-case
// published/draft question breakdown + authorship + a searchable text
// blob (scenario + chart tabs), then hands everything to the shared
// CasesListClient which renders the filter bar + filtered table.
//
// Reuses .auth-list-* styles from styles/authoring.css.

import Link from 'next/link';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import { createCaseAction } from '@/lib/bank/wrappers/case-study/actions';
import { loadAuthorship } from '@/lib/audit/authorship';
import { richTextToPlain } from '@/lib/authoring/rich-doc';
import {
  CasesListClient,
  type CaseListRow,
} from '@/lib/bank/wrappers/case-study/cases-list-client';

export const dynamic = 'force-dynamic';

interface CaseDbRow {
  case_id:          string;
  title:            string;
  scenario_summary: string | null;
  tags:               string[] | null;
  is_published:       boolean;
  is_builder_visible: boolean;
  is_free_sample:     boolean;
  updated_at:         string;
}

interface CaseQuestionRow { parent_case_id: string | null; is_published: boolean }
interface TabRow { case_id: string; title: string | null; entries: unknown; columns_def: unknown }

export default async function AdminCasesV2ListPage() {
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  const { data: caseRows, error: caseErr } = await supabase
    .from('nclex_case_studies')
    .select('case_id, title, scenario_summary, tags, is_published, is_builder_visible, is_free_sample, updated_at')
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
    scenario:           richTextToPlain(c.scenario_summary) || null,
    tabTitles:          (tabsByCase[c.case_id] ?? []).map((t) => t.title ?? '').filter(Boolean),
    is_published:       c.is_published,
    is_builder_visible: c.is_builder_visible,
    is_free_sample:     c.is_free_sample,
    updated_at:         c.updated_at,
    total:          slotStats[c.case_id]?.total ?? 0,
    published:      slotStats[c.case_id]?.published ?? 0,
    searchText:     buildCaseSearchText(c, tabsByCase[c.case_id] ?? []),
  }));

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner">
        <header className="bl-page-head">
          <div>
            <div className="bl-eyebrow">
              <span className="bl-surface-chip admin"><span className="dot" />Admin bank</span>
              Wrapper · cases
            </div>
            <h1 className="bl-page-title">Case Studies</h1>
            <p className="bl-page-sub">
              Multi-question NCLEX scenarios with a shared patient chart — up to
              six questions under one case. A case reaches students only when
              published, builder-visible, and complete.
            </p>
          </div>
          <div className="bl-head-actions">
            <Link href="/admin/dashboard" className="bl-btn">← Admin</Link>
            <Link href="/admin/bank/all" className="bl-btn">All questions →</Link>
            <Link href="/admin/bank/trends" className="bl-btn">Trend datasets →</Link>
          </div>
        </header>

        {rows.length === 0 ? (
          <div className="auth-list-empty">
            <h3>No case studies yet</h3>
            <p>Click <strong>+ New case study</strong> to create the first one.</p>
            <div style={{ marginTop: 12 }}>
              <NewCaseButton surface="admin" />
            </div>
          </div>
        ) : (
          <CasesListClient
            rows={rows}
            authorship={authorship}
            surface="admin"
            newButton={<NewCaseButton surface="admin" />}
          />
        )}
      </div>
    </main>
  );
}

// "+ New case study" — a server-action form whose submit creates a draft
// and redirects. Rendered in the redesigned toolbar slot + the empty state.
function NewCaseButton({ surface }: { surface: 'admin' | 'tutor' }) {
  return (
    <form
      action={async (fd: FormData) => {
        'use server';
        await createCaseAction(fd);
      }}
      style={{ display: 'inline' }}
    >
      <input type="hidden" name="surface" value={surface} />
      <button type="submit" className="bl-btn bl-btn-primary">+ New case study</button>
    </form>
  );
}

// Lowercased searchable blob: title + scenario + tags + every chart tab's
// title and data. JSON.stringify is a pragmatic flatten for the chart
// entries (substring search; tiny N so cost is irrelevant).
function buildCaseSearchText(c: CaseDbRow, tabs: TabRow[]): string {
  const parts: string[] = [
    c.title, richTextToPlain(c.scenario_summary),
    ...(c.tags ?? []),
  ];
  for (const t of tabs) {
    parts.push(t.title ?? '');
    if (t.entries) parts.push(JSON.stringify(t.entries));
    if (t.columns_def) parts.push(JSON.stringify(t.columns_def));
  }
  return parts.join(' ').toLowerCase();
}
