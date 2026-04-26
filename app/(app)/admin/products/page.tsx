// mynclex/app/(app)/admin/products/page.tsx
//
// Products & Pricing — placeholder. Gated on PAYMENTS_MANAGE.

import { requireAdminPermission, PERM_PAYMENTS_MANAGE } from '@/lib/access';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  await requireAdminPermission(PERM_PAYMENTS_MANAGE);

  return (
    <Placeholder
      title="Products & Pricing"
      subtitle="Bank duration packs + prices"
      description="GHS + USD dual pricing, activate / retire products."
    />
  );
}
