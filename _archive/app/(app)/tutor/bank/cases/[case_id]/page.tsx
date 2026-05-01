// mynclex/app/(app)/tutor/bank/cases/[case_id]/page.tsx
//
// Tutor Case Study editor (Slice 1.11a). Server component that:
//   1. Gates on the TUTOR role.
//   2. Fetches the case row + its tabs, scoped to tutor_id = auth.uid().
//   3. Mounts <CaseStudyEditor surface='tutor' initial={...} />.
//
// RLS on nclex_tutor_case_studies enforces ownership at the DB layer;
// the explicit .eq('tutor_id', user.id) is belt-and-braces.

import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CaseStudyEditor } from '@/lib/bank/case-study/editor';
import { loadCaseSlots } from '@/lib/bank/case-study/slot-loader';
import type {
  CaseStudyEditorInitial,
  CaseStudyRow,
  CaseStudyTabRow,
} from '@/lib/bank/case-study/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ case_id: string }>;
}

export default async function TutorCaseEditorPage({ params }: PageProps) {
  const { case_id } = await params;
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

  const [caseRes, tabsRes, slots] = await Promise.all([
    supabase
      .from('nclex_tutor_case_studies')
      .select('*')
      .eq('case_id', case_id)
      .eq('tutor_id', user.id)
      .maybeSingle(),
    supabase
      .from('nclex_tutor_case_study_tabs')
      .select('*')
      .eq('case_id', case_id)
      .order('display_order', { ascending: true }),
    loadCaseSlots(supabase, case_id, 'tutor'),
  ]);

  if (caseRes.error) {
    return (
      <main className="bank-page">
        <p className="bank-error">Error loading case: {caseRes.error.message}</p>
      </main>
    );
  }

  if (!caseRes.data) notFound();

  const initial: CaseStudyEditorInitial = {
    caseRow: caseRes.data as CaseStudyRow,
    tabs: (tabsRes.data ?? []) as CaseStudyTabRow[],
    slots,
  };

  return <CaseStudyEditor surface="tutor" initial={initial} />;
}
