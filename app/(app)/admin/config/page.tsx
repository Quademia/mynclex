// mynclex/app/(app)/admin/config/page.tsx
//
// System Config — placeholder. Gated on SYSTEM_MANAGE.

import { requireAdminPermission, PERM_SYSTEM_MANAGE } from '@/lib/access';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminConfigPage() {
  await requireAdminPermission(PERM_SYSTEM_MANAGE);

  return (
    <Placeholder
      title="System Config"
      subtitle="Platform settings"
      description="Key/value system config. Read-only keys, editable values."
    />
  );
}
