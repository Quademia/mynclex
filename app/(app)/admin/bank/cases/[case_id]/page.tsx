// mynclex/app/(app)/admin/bank/cases/[case_id]/page.tsx
//
// Admin Case Study editor (Slice 1.11a). Server component that:
//   1. Gates on BANK_CURATE / SUPER_ADMIN.
//   2. Fetches the case row + its tabs.
//   3. Mounts <CaseStudyEditor surface='admin' initial={...} />.
//
// Tutor twin lives at (app)/tutor/bank/cases/[case_id]/page.tsx.

import { notFound } from 'next/navigation';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/auth';
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

export default async function AdminCaseEditorPage({ params }: PageProps) {
  const { case_id } = await params;
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  const [caseRes, tabsRes, slots] = await Promise.all([
    supabase
      .from('nclex_case_studies')
      .select('*')
      .eq('case_id', case_id)
      .maybeSingle(),
    supabase
      .from('nclex_case_study_tabs')
      .select('*')
      .eq('case_id', case_id)
      .order('display_order', { ascending: true }),
    loadCaseSlots(supabase, case_id, 'admin'),
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

  return <CaseStudyEditor surface="admin" initial={initial} />;
}
