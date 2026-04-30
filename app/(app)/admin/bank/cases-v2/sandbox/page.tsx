// mynclex/app/(app)/admin/bank/cases-v2/sandbox/page.tsx
//
// Slice 12 working sandbox — visual-only three-pane case-study wrapper.
// Hardcoded data, no DB reads, no DB writes. The sandbox lives here
// while we agree the shape; once finalised, the same component (renamed
// and rewired to real data) becomes the body of the real `[case_id]`
// page in slice 12b.

import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import { CaseStudyWrapperSandbox } from '@/lib/authoring/wrappers/case-study/sandbox-page';

export const dynamic = 'force-dynamic';

export default async function CaseStudyWrapperSandboxPage() {
  await requireAdminPermission(PERM_BANK_CURATE);
  return <CaseStudyWrapperSandbox />;
}
