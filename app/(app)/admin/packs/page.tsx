// mynclex/app/(app)/admin/packs/page.tsx
//
// Readiness Packs — placeholder. Gated on BANK_CURATE.

import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/auth';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminPacksPage() {
  await requireAdminPermission(PERM_BANK_CURATE);

  return (
    <Placeholder
      title="Readiness Packs"
      subtitle="Curated assessment sets"
      description="Create and publish readiness packs with reserved questions."
    />
  );
}
