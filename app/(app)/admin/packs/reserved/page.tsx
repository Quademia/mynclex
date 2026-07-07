// mynclex/app/(app)/admin/packs/reserved/page.tsx
//
// The reserved-stock lens (Slice ③, readiness-packs.md §4/§8) —
// dedicated page behind the pill strip's [Reserved stock] pill (Sam's
// placement call, 2026-07-07 second session): every readiness-reserved
// question with its pack assignment, the how-far-to-500 bookkeeping.
// Static segment, so it wins over the sibling [pack_id] route.
// Gated on BANK_CURATE.

import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import { loadPacksOverview, loadReservedStock } from '@/lib/bank/packs/queries';
import { PacksAreaHead } from '@/lib/bank/packs/area-head';
import { ReservedStockView } from '@/lib/bank/packs/reserved-view';

export const dynamic = 'force-dynamic';

export default async function AdminReservedStockPage() {
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  const [packs, stock] = await Promise.all([
    loadPacksOverview(supabase),
    loadReservedStock(supabase),
  ]);

  return (
    <main className="auth-list-page">
      <PacksAreaHead
        title="Reserved stock"
        right={
          <div className="rp-head-note">
            reserved questions never appear in student practice
          </div>
        }
        packs={packs}
        activeId="reserved"
      />
      <div className="auth-list-inner">
        <ReservedStockView stock={stock} />
      </div>
    </main>
  );
}
