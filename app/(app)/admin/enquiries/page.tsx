// mynclex/app/(app)/admin/enquiries/page.tsx
//
// Programme Enquiries — placeholder. Gated on PROGRAMMES_VIEW.

import { requireAdminPermission, PERM_PROGRAMMES_VIEW } from '@/lib/access';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminEnquiriesPage() {
  await requireAdminPermission(PERM_PROGRAMMES_VIEW);

  return (
    <Placeholder
      title="Programme Enquiries"
      subtitle="Contact-first public enquiries"
      description="Follow up with prospective programme students."
    />
  );
}
