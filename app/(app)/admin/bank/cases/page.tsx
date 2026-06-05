// mynclex/app/(app)/admin/bank/cases/page.tsx
//
// Slice 12a — admin Case Studies list. Reads nclex_case_studies
// and renders a simple table. Each row links to the [case_id] page
// (currently a stub; the real wrapper page lands in slice 12b).
//
// Companion to /admin/bank/cases/sandbox (the visual-only design
// scratchpad). Both routes coexist until the slice-14 swap.
//
// Reuses .auth-list-* styles from styles/authoring.css.

import Link from 'next/link';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import { createCaseAction } from '@/lib/bank/wrappers/case-study/actions';
import { QuestionPills } from '@/lib/bank/wrappers/question-pills';
import { loadAuthorship } from '@/lib/audit/authorship';
import { AuthorshipCell } from '@/lib/audit/authorship-line';

export const dynamic = 'force-dynamic';

interface CaseRow {
  case_id:        string;
  title:          string;
  is_published:   boolean;
  is_free_sample: boolean;
  difficulty:     string | null;
  updated_at:     string;
}

interface CaseQuestionRow {
  parent_case_id: string | null;
  is_published:   boolean;
}

export default async function AdminCasesV2ListPage() {
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  const { data: caseRows, error: caseErr } = await supabase
    .from('nclex_case_studies')
    .select('case_id, title, is_published, is_free_sample, difficulty, updated_at')
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

  const cases = (caseRows ?? []) as CaseRow[];

  // Per-case question counts + published / draft breakdown. Read the
  // case's questions directly (parent_case_id) so the total and the
  // published split come from one consistent source. Small N — bucket
  // in JS rather than an RPC.
  const slotStats: Record<string, { total: number; published: number }> = {};
  if (cases.length > 0) {
    const ids = cases.map((c) => c.case_id);
    const { data: qRows } = await supabase
      .from('nclex_bank_items')
      .select('parent_case_id, is_published')
      .in('parent_case_id', ids);
    for (const row of (qRows ?? []) as CaseQuestionRow[]) {
      const cid = row.parent_case_id;
      if (!cid) continue;
      const s = (slotStats[cid] ??= { total: 0, published: 0 });
      s.total += 1;
      if (row.is_published) s.published += 1;
    }
  }

  // Authorship facts (who created / last edited the case wrapper row
  // itself — not its questions; those carry their own history).
  const authorship = await loadAuthorship(
    supabase, 'admin', 'case_study', cases.map((c) => c.case_id),
  );

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
                // createCaseAction redirects on success; the SaveResult
                // return type is only for the failure branch. The form
                // action slot wants void | Promise<void>, so swallow.
                await createCaseAction(fd);
              }}
              style={{ display: 'inline' }}
            >
              <input type="hidden" name="surface" value="admin" />
              <button type="submit" className="auth-cs-btn primary">+ New case study</button>
            </form>
          </div>
        </header>

        <p className="auth-list-count">{cases.length} case{cases.length === 1 ? '' : 's'}</p>

        {cases.length === 0 ? (
          <div className="auth-list-empty">
            <h3>No case studies yet</h3>
            <p>Click <strong>+ New case study</strong> to create the first one.</p>
            <form
              action={async (fd: FormData) => {
                'use server';
                await createCaseAction(fd);
              }}
              style={{ marginTop: 12 }}
            >
              <input type="hidden" name="surface" value="admin" />
              <button type="submit" className="auth-cs-btn primary">+ New case study</button>
            </form>
          </div>
        ) : (
          <table className="auth-list-table">
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Title</th>
                <th>Slots</th>
                <th>Status</th>
                <th>Difficulty</th>
                <th>Updated</th>
                <th>Authors</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.case_id}>
                  <td className="auth-list-item-id"><code>{c.case_id}</code></td>
                  <td>{c.title}</td>
                  <td>
                    {slotStats[c.case_id]?.total ?? 0} of 6
                    <QuestionPills
                      total={slotStats[c.case_id]?.total ?? 0}
                      published={slotStats[c.case_id]?.published ?? 0}
                    />
                  </td>
                  <td>
                    {c.is_published
                      ? <span className="auth-cs-tag ok">Published</span>
                      : <span className="auth-cs-tag muted">Draft</span>}
                    {c.is_free_sample && (
                      <span className="auth-cs-tag info" style={{ marginLeft: 6 }}>Free sample</span>
                    )}
                  </td>
                  <td>{c.difficulty ?? '—'}</td>
                  <td>{new Date(c.updated_at).toLocaleDateString()}</td>
                  <td>
                    <AuthorshipCell
                      authorship={authorship[c.case_id]}
                      realm="admin"
                      entityType="case_study"
                      entityId={c.case_id}
                      title={c.title}
                    />
                  </td>
                  <td className="auth-list-row-actions">
                    <Link href={`/admin/bank/cases/${c.case_id}`} className="auth-cs-btn tiny">
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
