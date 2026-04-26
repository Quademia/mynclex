// mynclex/app/(app)/admin/announcements/page.tsx
//
// Announcements — placeholder. Gated on COMMS_MANAGE.

import { requireAdminPermission, PERM_COMMS_MANAGE } from '@/lib/access';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminAnnouncementsPage() {
  await requireAdminPermission(PERM_COMMS_MANAGE);

  return (
    <Placeholder
      title="Announcements"
      subtitle="Platform-wide messaging"
      description="Target by audience, schedule, publish."
    />
  );
}
