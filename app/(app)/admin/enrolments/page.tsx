// mynclex/app/(app)/admin/enrolments/page.tsx
//
// Enrolments — placeholder. Gated on PROGRAMMES_VIEW.

import { requireAdminPermission, PERM_PROGRAMMES_VIEW } from '@/lib/access';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminEnrolmentsPage() {
  await requireAdminPermission(PERM_PROGRAMMES_VIEW);

  return (
    <Placeholder
      title="Enrolments"
      subtitle="Student-to-programme links"
      description="Active + expired. Grant manually, revoke, audit."
    />
  );
}
