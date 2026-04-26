// mynclex/app/(app)/admin/dashboard/page.tsx
//
// Admin dashboard — placeholder. No permission gate beyond the parent
// layout's ADMIN/SUPER_ADMIN check; every admin lands here after
// /admin redirects.

import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default function AdminDashboardPage() {
  return (
    <Placeholder
      title="Dashboard"
      subtitle="Admin overview"
      description="Summary cards (pending tutor apps, open reports, active students) and quick links land here. Today: placeholder only — real stat cards arrive when each section ships."
    />
  );
}
