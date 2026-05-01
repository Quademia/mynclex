// mynclex/app/(app)/tutor/bank/cases/page.tsx
//
// Slice 12a — tutor twin of /admin/bank/cases. Reads
// nclex_tutor_case_studies filtered by tutor_id (RLS also enforces
// this at the DB layer, but the client filter is belt-and-braces).
// Each row links to the [case_id] stub (real wrapper lands in 12b).

import Link from 'next/link';
import { requireBankCurator } from '@/lib/access';
import { createCaseAction } from '@/lib/bank/wrappers/case-study/actions';

export const dynamic = 'force-dynamic';

interface CaseRow {
  case_id:        string;
  title:          string;
  is_published:   boolean;
  is_free_sample: boolean;
  difficulty:     string | null;
  updated_at:     string;
}

interface SlotCount {
  case_id: string;
  count:   number;
}

export default async function TutorCasesV2ListPage() {
  const { supabase, user } = await requireBankCurator('tutor');

  const { data: caseRows, error: caseErr } = await supabase
    .from('nclex_tutor_case_studies')
    .select('case_id, title, is_published, is_free_sample, difficulty, updated_at')
    .eq('tutor_id', user.id)
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

  let slotCounts: Record<string, number> = {};
  if (cases.length > 0) {
    const ids = cases.map((c) => c.case_id);
    const { data: slotRows } = await supabase
      .from('nclex_tutor_case_study_items')
      .select('case_id')
      .in('case_id', ids);
    for (const row of (slotRows ?? []) as SlotCount[]) {
      slotCounts[row.case_id] = (slotCounts[row.case_id] ?? 0) + 1;
    }
  }

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner">
        <header className="auth-list-page-header">
          <div>
            <h1 className="auth-list-page-title">Case Studies</h1>
            <p className="auth-list-page-subtitle">
              Your private NCLEX case studies. Each groups up to 6 questions
              under a shared patient chart. Click a row to open the wrapper editor.
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
              <input type="hidden" name="surface" value="tutor" />
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
              <input type="hidden" name="surface" value="tutor" />
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.case_id}>
                  <td className="auth-list-item-id"><code>{c.case_id}</code></td>
                  <td>{c.title}</td>
                  <td>{slotCounts[c.case_id] ?? 0} of 6</td>
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
                  <td className="auth-list-row-actions">
                    <Link href={`/tutor/bank/cases/${c.case_id}`} className="auth-cs-btn tiny">
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
