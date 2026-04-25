// mynclex/app/(app)/tutor/bank/cases/page.tsx
//
// Tutor Case Studies list (Slice 1.11a). Tutor-scoped twin of the
// admin cases list — same shape, but gated on the TUTOR role and
// filtered to tutor_id = auth.uid() (belt-and-braces; RLS also
// enforces this at the DB layer).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createCaseAction } from '@/lib/bank/case-study/actions';
import type { CaseStudyRow } from '@/lib/bank/case-study/types';

export const dynamic = 'force-dynamic';

const BASE_URL = '/tutor/bank/cases';

export default async function TutorCasesListPage({
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
    .from('nclex_tutor_case_studies')
    .select('case_id, title, is_published, is_free_sample, difficulty, updated_at, created_at')
    .eq('tutor_id', user.id)
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
            Your private NCLEX case studies. Each groups 1–6 questions
            under a shared patient chart.
          </p>
        </div>
        <div className="cs-list-actions">
          <Link href="/tutor/bank/all" className="cs-btn">← Back to bank</Link>
          <form
            action={async (fd: FormData) => {
              'use server';
              await createCaseAction(fd);
            }}
            style={{ display: 'inline' }}
          >
            <input type="hidden" name="surface" value="tutor" />
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
