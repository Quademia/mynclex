// mynclex/app/(app)/admin/tutors/page.tsx
//
// Tutors — placeholder. Gated on TUTORS_MANAGE.

import { requireAdminPermission, PERM_TUTORS_MANAGE } from '@/lib/auth';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminTutorsPage() {
  await requireAdminPermission(PERM_TUTORS_MANAGE);

  return (
    <Placeholder
      title="Tutors"
      subtitle="Active tutor accounts"
      description="Approved tutor roster. Deactivate, edit profile, view their programmes."
    />
  );
}
