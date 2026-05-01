// mynclex/app/(app)/tutor/bank/cases-v2/[case_id]/page.tsx
//
// Slice 12b — tutor twin of the admin wrapper page. Loads from the
// tutor tables (nclex_tutor_case_studies + nclex_tutor_case_study_tabs
// + nclex_tutor_case_study_items + nclex_tutor_questions) filtered
// by tutor_id (RLS enforces this DB-side too).

import { notFound } from 'next/navigation';
import { requireBankCurator } from '@/lib/access';
import { loadCase } from '@/lib/authoring/wrappers/case-study/load-case';
import { CaseStudyWrapperPage } from '@/lib/authoring/wrappers/case-study/wrapper-page';

export const dynamic = 'force-dynamic';

interface PageParams {
  params:        Promise<{ case_id: string }>;
  searchParams?: Promise<{ focus?: string }>;
}

export default async function TutorCaseStudyV2Page({ params, searchParams }: PageParams) {
  const { case_id } = await params;
  const sp = await searchParams;
  const focusItemId = sp?.focus ?? null;
  const { supabase } = await requireBankCurator('tutor');

  const data = await loadCase(supabase, 'tutor', case_id);
  if (!data) notFound();

  return <CaseStudyWrapperPage data={data} focusItemId={focusItemId} />;
}
