// mynclex/app/(app)/admin/programmes/page.tsx
//
// Programmes — placeholder. Gated on PROGRAMMES_VIEW.

import { requireAdminPermission, PERM_PROGRAMMES_VIEW } from '@/lib/access';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminProgrammesPage() {
  await requireAdminPermission(PERM_PROGRAMMES_VIEW);

  return (
    <Placeholder
      title="Programmes"
      subtitle="All programmes across all tutors"
      description="Read-only oversight. Suspend, audit content if needed."
    />
  );
}
