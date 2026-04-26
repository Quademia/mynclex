// mynclex/app/(app)/admin/users/page.tsx
//
// Users — placeholder. Gated on USERS_MANAGE.

import { requireAdminPermission, PERM_USERS_MANAGE } from '@/lib/auth';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  await requireAdminPermission(PERM_USERS_MANAGE);

  return (
    <Placeholder
      title="Users"
      subtitle="All student, tutor, admin accounts"
      description="Search, filter by role, suspend, grant, delete."
    />
  );
}
