// mynclex/app/(app)/admin/bank/cases/[case_id]/page.tsx
//
// Slice 12b — admin case-study wrapper page. Loads the case row +
// chart tabs + slot join rows + linked-question summary via
// load-case.ts, then renders the two-mode wrapper UI.
//
// Read-only for 12b: data displays, navigation works (slot click
// enters editor mode, ← Wrapper view returns), but Save buttons
// stay as no-ops. Real save plumbing wires up in 12c.

import { notFound } from 'next/navigation';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import { loadCase } from '@/lib/bank/wrappers/case-study/load-case';
import { CaseStudyWrapperPage } from '@/lib/bank/wrappers/case-study/wrapper-page';

export const dynamic = 'force-dynamic';

interface PageParams {
  params:        Promise<{ case_id: string }>;
  searchParams?: Promise<{ focus?: string }>;
}

export default async function AdminCaseStudyPage({ params, searchParams }: PageParams) {
  const { case_id } = await params;
  const sp = await searchParams;
  const focusItemId = sp?.focus ?? null;
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  const data = await loadCase(supabase, 'admin', case_id);
  if (!data) notFound();

  return <CaseStudyWrapperPage data={data} focusItemId={focusItemId} />;
}
