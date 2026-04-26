// mynclex/app/(app)/admin/reports/page.tsx
//
// Question Reports — placeholder. Gated on BANK_CURATE.

import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/auth';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminReportsPage() {
  await requireAdminPermission(PERM_BANK_CURATE);

  return (
    <Placeholder
      title="Question Reports"
      subtitle="Student-reported questions"
      description="Dismiss / Mark for fix queue."
    />
  );
}
