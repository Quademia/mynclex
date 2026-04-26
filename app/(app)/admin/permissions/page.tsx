// mynclex/app/(app)/admin/permissions/page.tsx
//
// Admin Permissions — placeholder. Gated on the SUPER_ADMIN role
// (NOT a permission bucket — only super-admins can grant other
// admins their buckets, and the page used to do it isn't a
// permission to itself).

import { requireSuperAdmin } from '@/lib/auth';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminPermissionsPage() {
  await requireSuperAdmin();

  return (
    <Placeholder
      title="Admin Permissions"
      subtitle="Super_admin only"
      description="Create admin accounts, grant permission buckets, revoke. Coming soon — this page will let super admins manage what other admins can see and do."
    />
  );
}
