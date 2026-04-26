// mynclex/app/(app)/admin/bank/cases/page.tsx
//
// Admin Case Studies list (Slice 1.11a). Simple table — case_id,
// title, published badge, updated_at, Edit link. "+ New case" button
// posts to createCaseAction with surface='admin' and redirects to
// the editor where the curator fills in title + chart tabs.
//
// Role gate mirrors /admin/bank: BANK_CURATE permission OR SUPER_ADMIN
// short-circuit. Failure redirects to /admin.

import Link from 'next/link';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/auth';
import { createCaseAction } from '@/lib/bank/case-study/actions';
import type { CaseStudyRow } from '@/lib/bank/case-study/types';

export const dynamic = 'force-dynamic';

const BASE_URL = '/admin/bank/cases';

export default async function AdminCasesListPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string }>;
}) {
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  const params = await searchParams;

  const { data, error } = await supabase
    .from('nclex_case_studies')
    .select('case_id, title, is_published, is_free_sample, difficulty, updated_at, created_at')
    .order('updated_at', { ascending: false });

  if (error) {
    return (
      <main className="bank-page">
        <h1>Case Studies</h1>
        <p className="bank-error">Error loading cases: {error.message}</p>
      </main>
    );
  }

  const cases = (data ?? []) as Array<Pick<
    CaseStudyRow,
    'case_id' | 'title' | 'is_published' | 'is_free_sample' | 'difficulty' | 'updated_at' | 'created_at'
  >>;

  return (
    <main className="bank-page">
      <div className="cs-list-head">
        <div>
          <h1>Case Studies</h1>
          <p className="cs-list-sub">
            Multi-question NCLEX scenarios with a shared patient chart.
            Each case groups 1–6 questions under one scenario plus up to
            10+ chart tabs.
          </p>
        </div>
        <div className="cs-list-actions">
          <Link href="/admin/bank/all" className="cs-btn">← Back to bank</Link>
          <form
            action={async (fd: FormData) => {
              'use server';
              // createCaseAction redirects on success; the ActionResult
              // return type is only for the failure branch. The
              // <form action> slot wants void | Promise<void>, so we
              // swallow the result here.
              await createCaseAction(fd);
            }}
            style={{ display: 'inline' }}
          >
            <input type="hidden" name="surface" value="admin" />
            <button type="submit" className="cs-btn primary">+ New case</button>
          </form>
        </div>
      </div>

      {params.saved === '1' && (
        <div className="cs-banner ok">Case saved.</div>
      )}
      {params.deleted === '1' && (
        <div className="cs-banner ok">Case deleted.</div>
      )}

      {cases.length === 0 ? (
        <div className="cs-list-empty">
          <h3>No case studies yet</h3>
          <p>Click <strong>+ New case</strong> to create the first one.</p>
        </div>
      ) : (
        <table className="cs-list-table">
          <thead>
            <tr>
              <th>Case ID</th>
              <th>Title</th>
              <th>Status</th>
              <th>Difficulty</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.case_id}>
                <td><code>{c.case_id}</code></td>
                <td>{c.title}</td>
                <td>
                  {c.is_published
                    ? <span className="cs-pill ok">Published</span>
                    : <span className="cs-pill muted">Draft</span>}
                  {c.is_free_sample && <span className="cs-pill info" style={{ marginLeft: 6 }}>Free sample</span>}
                </td>
                <td>{c.difficulty ?? '—'}</td>
                <td>{new Date(c.updated_at).toLocaleDateString()}</td>
                <td>
                  <Link href={`${BASE_URL}/${c.case_id}`} className="cs-btn">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
