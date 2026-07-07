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
import { PackStrip } from '@/lib/bank/packs/pack-strip';
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
      <div className="auth-list-inner">
        <header className="bl-page-head rp-area-head">
          <div>
            <div className="bl-eyebrow">
              <span className="bl-surface-chip admin"><span className="dot" />Admin bank</span>
              Readiness packs
            </div>
            <h1 className="bl-page-title">Reserved stock</h1>
          </div>
          <div className="rp-head-note">
            reserved questions never appear in student practice
          </div>
        </header>

        <PackStrip packs={packs} activeId="reserved" />

        <ReservedStockView stock={stock} />
      </div>
    </main>
  );
}
