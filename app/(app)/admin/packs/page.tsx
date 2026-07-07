// mynclex/app/(app)/admin/packs/page.tsx
//
// Readiness packs list — Slice ①, reworked in ②a to share the
// loadPacksOverview reader + the pill strip with the detail route, and
// the cards now link into /admin/packs/[pack_id]
// (docs/product-plan/readiness-packs.md §12). Gated on BANK_CURATE.

import Link from 'next/link';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import { loadPacksOverview, loadPacksSubcats } from '@/lib/bank/packs/queries';
import { blueprintHealth } from '@/lib/bank/packs/composition';
import { PacksAreaHead } from '@/lib/bank/packs/area-head';
import { NewPackButton } from '@/lib/bank/packs/new-pack-button';
import { PackCardMenu } from '@/lib/bank/packs/pack-card-menu';

export const dynamic = 'force-dynamic';

export default async function AdminPacksPage() {
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);
  const [packs, subcatsByPack] = await Promise.all([
    loadPacksOverview(supabase),
    loadPacksSubcats(supabase),
  ]);

  return (
    <main className="auth-list-page">
      <PacksAreaHead
        title="Readiness packs"
        right={
          <div className="bl-head-actions">
            <Link href="/admin/dashboard" className="bl-btn">← Admin</Link>
            <Link href="/admin/bank/all" className="bl-btn">Question bank →</Link>
            <NewPackButton />
          </div>
        }
        packs={packs}
        activeId={null}
      />
      <div className="auth-list-inner">
        <p className="bl-page-sub">
          Curated 100-question exam-simulating assessments, sold separately.
          Each student sits a pack once, under exam timing — so fill them
          deliberately from reserved stock.
        </p>

        <div className="rp-grid">
          {packs.map((p) => {
            const target = p.n ?? 100;
            const pct = target > 0 ? Math.min(100, Math.round((p.count / target) * 100)) : 0;
            const health = blueprintHealth(subcatsByPack[p.pack_id] ?? []);
            return (
              <div key={p.pack_id} className="rp-card-wrap">
                <Link
                  href={`/admin/packs/${p.pack_id}`}
                  className="rp-card rp-card-link"
                >
                  <div className="rp-card-top">
                    <span className="rp-pack-id">{p.pack_id}</span>
                    <span className={`rp-status ${p.status}`}>
                      {p.published ? 'published' : p.status}
                    </span>
                  </div>
                  <h2 className="rp-title">{p.title}</h2>
                  <div className="rp-fill-row">
                    <span className="rp-fill-count">
                      {p.count} <span className="of">/ {target} questions</span>
                    </span>
                    {health && (
                      <span
                        className={`rp-bp-hint ${health.inRange === health.total ? 'ok' : 'warn'}`}
                        title="Client Needs categories inside the published NCLEX blueprint ranges — guidance, never a block"
                      >
                        Blueprint {health.inRange}/{health.total}
                      </span>
                    )}
                  </div>
                  <div className="rp-fill-bar">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <div className="rp-meta">
                    <span>⏱ {formatTimeLimit(p.time_limit_sec)}</span>
                    <span>One shot · exam pace</span>
                  </div>
                </Link>
                <PackCardMenu pack={p} />
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

// 12000 s → "3 h 20 m"
function formatTimeLimit(sec: number | null): string {
  if (!sec || sec <= 0) return 'No time limit set';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}
