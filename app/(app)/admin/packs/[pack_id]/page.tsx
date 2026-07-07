// mynclex/app/(app)/admin/packs/[pack_id]/page.tsx
//
// Readiness pack detail — Slice ②a (readiness-packs.md §12): members
// in sat order with case/trend units as grouped blocks, move/remove,
// pack basics. The picker (②b) and meters/publish gate (③) land on
// this same page next. Gated on BANK_CURATE.

import { notFound } from 'next/navigation';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import { loadPacksOverview, loadPackDetail } from '@/lib/bank/packs/queries';
import { PackStrip } from '@/lib/bank/packs/pack-strip';
import { PackMembersList } from '@/lib/bank/packs/members-list';
import { PackBasicsCard } from '@/lib/bank/packs/basics-card';

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

        <div className="rp-detail-head">
          <div className="rp-detail-title">
            <h2>{pack.title}</h2>
            <span className={`rp-status ${pack.status}`}>
              {pack.published ? 'published' : pack.status}
            </span>
          </div>
          <div className="rp-detail-meta">
            <span className="rp-mono">{pack.pack_id}</span>
            <span>{count} of {target} positions filled</span>
            <span>⏱ {formatTimeLimit(pack.time_limit_sec)}</span>
          </div>
        </div>

        <div className="rp-detail-cols">
          <PackMembersList
            packId={pack.pack_id}
            units={units}
            count={count}
            target={target}
          />
          <aside className="rp-detail-side">
            <PackBasicsCard pack={pack} />
          </aside>
        </div>
      </div>
    </main>
  );
}

function formatTimeLimit(sec: number | null): string {
  if (!sec || sec <= 0) return 'No time limit set';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}
