// mynclex/app/(app)/admin/dashboard/page.tsx
//
// Admin dashboard — placeholder. requireAnyAdmin() is belt-and-braces
// with the parent admin/layout.tsx gate; every admin page in the
// scaffold runs its own check so adding new pages can't accidentally
// drop the protection.

import { Placeholder } from '@/components/nav/shared/placeholder';
import { requireAnyAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  await requireAnyAdmin();

  return (
    <Placeholder
      title="Dashboard"
      subtitle="Admin overview"
      description="Summary cards (pending tutor apps, open reports, active students) and quick links land here. Today: placeholder only — real stat cards arrive when each section ships."
    />
  );
}
