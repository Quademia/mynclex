// mynclex/app/(app)/admin/applications/page.tsx
//
// Tutor Applications — placeholder. Gated on TUTORS_MANAGE.

import { requireAdminPermission, PERM_TUTORS_MANAGE } from '@/lib/auth';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminApplicationsPage() {
  await requireAdminPermission(PERM_TUTORS_MANAGE);

  return (
    <Placeholder
      title="Tutor Applications"
      subtitle="Pending + decided"
      description="Review applicants, approve + trigger setup-link email, reject."
    />
  );
}
