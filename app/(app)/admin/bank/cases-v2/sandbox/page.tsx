// mynclex/app/(app)/admin/bank/cases-v2/sandbox/page.tsx
//
// Slice 12 sandbox route — passes hardcoded SAMPLE_DATA into the real
// CaseStudyWrapperPage component so curators can preview the geometry
// without needing an actual case row in the DB.
//
// Same component as the real /cases-v2/[case_id] page; only the data
// source differs. Removed at slice 14 swap.

import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import {
  CaseStudyWrapperPage,
  SAMPLE_DATA,
} from '@/lib/authoring/wrappers/case-study/wrapper-page';

export const dynamic = 'force-dynamic';

export default async function CaseStudyWrapperSandboxPage() {
  await requireAdminPermission(PERM_BANK_CURATE);
  return <CaseStudyWrapperPage data={SAMPLE_DATA} sandboxMode />;
}
