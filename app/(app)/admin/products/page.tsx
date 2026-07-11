// mynclex/app/(app)/admin/products/page.tsx
//
// Products & Pricing — the buyable-SKU catalogue (readiness-packs.md
// §12 slice ①). Bank passes + the free trial + readiness packs, with
// create / edit / retire / reactivate. Gated on PAYMENTS_MANAGE; the
// matching RLS policy (20260723120000) is what lets this page read
// ARCHIVED rows at all.

import { requireAdminPermission, PERM_PAYMENTS_MANAGE } from '@/lib/access';
import { loadCatalogue } from '@/lib/products/queries';
import { CatalogueView } from '@/lib/products/catalogue-view';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  const { supabase } = await requireAdminPermission(PERM_PAYMENTS_MANAGE);
  const { products, packCount } = await loadCatalogue(supabase);

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner pr-page">
        <CatalogueView products={products} packCount={packCount} />
      </div>
    </main>
  );
}
