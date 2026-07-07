// mynclex/app/(app)/admin/packs/[pack_id]/page.tsx
//
// Readiness pack detail — Slices ②a + ②b (readiness-packs.md §12):
// members in sat order with case/trend units as grouped blocks,
// move/remove, pack basics, and the "Add questions" picker slide-over
// (header button + per-row ⊕ insert-above). Meters + publish gate (③)
// land on this same page next. Gated on BANK_CURATE.

import { notFound } from 'next/navigation';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import { loadPacksOverview, loadPackDetail } from '@/lib/bank/packs/queries';
import { PackStrip } from '@/lib/bank/packs/pack-strip';
import { PackDetailBody } from '@/lib/bank/packs/detail-body';

export const dynamic = 'force-dynamic';

export default async function AdminPackDetailPage({
  params,
}: {
  params: Promise<{ pack_id: string }>;
}) {
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);
  const { pack_id } = await params;

  const [packs, detail] = await Promise.all([
    loadPacksOverview(supabase),
    loadPackDetail(supabase, pack_id),
  ]);
  if (!detail) notFound();

  const { pack, units, count } = detail;
  const target = pack.n ?? 100;

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner">
        <header className="bl-page-head rp-area-head">
          <div>
            <div className="bl-eyebrow">
              <span className="bl-surface-chip admin"><span className="dot" />Admin bank</span>
              Readiness packs
            </div>
            <h1 className="bl-page-title">Readiness packs</h1>
          </div>
          <div className="rp-head-note">{target} questions · one shot · exam pace</div>
        </header>

        <PackStrip packs={packs} activeId={pack.pack_id} />

        <PackDetailBody pack={pack} units={units} count={count} target={target} />
      </div>
    </main>
  );
}
