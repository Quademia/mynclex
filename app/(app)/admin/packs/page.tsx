// mynclex/app/(app)/admin/packs/page.tsx
//
// Readiness packs list — Slice ① of the readiness-packs build
// (docs/product-plan/readiness-packs.md §12). The 5 seeded packs with
// status + fill progress read from the membership link table. Pack
// detail (picker, meters, publish gate) arrives in Slices ② + ③.
// Gated on BANK_CURATE.

import Link from 'next/link';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';

export const dynamic = 'force-dynamic';

interface PackRow {
  pack_id:        string;
  title:          string;
  description:    string | null;
  n:              number | null;
  time_limit_sec: number | null;
  published:      boolean;
  status:         'draft' | 'active' | 'archived';
}

export default async function AdminPacksPage() {
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  const { data: packRows, error: packErr } = await supabase
    .from('nclex_readiness_packs')
    .select('pack_id, title, description, n, time_limit_sec, published, status')
    .order('pack_id');

  if (packErr) {
    return (
      <main className="auth-list-page">
        <div className="auth-list-inner">
          <h1 className="auth-list-page-title">Readiness packs</h1>
          <p className="auth-sandbox-error">Could not load packs: {packErr.message}</p>
        </div>
      </main>
    );
  }

  const packs = (packRows ?? []) as PackRow[];

  // Fill counts off the link table — one row per member question.
  const fill: Record<string, number> = {};
  if (packs.length > 0) {
    const { data: linkRows } = await supabase
      .from('nclex_readiness_pack_items')
      .select('pack_id');
    for (const row of (linkRows ?? []) as { pack_id: string }[]) {
      fill[row.pack_id] = (fill[row.pack_id] ?? 0) + 1;
    }
  }

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner">
        <header className="bl-page-head">
          <div>
            <div className="bl-eyebrow">
              <span className="bl-surface-chip admin"><span className="dot" />Admin bank</span>
              Readiness packs
            </div>
            <h1 className="bl-page-title">Readiness packs</h1>
            <p className="bl-page-sub">
              Curated 100-question exam-simulating assessments, sold separately.
              Each student sits a pack once, under exam timing — so fill them
              deliberately from reserved stock.
            </p>
          </div>
          <div className="bl-head-actions">
            <Link href="/admin/dashboard" className="bl-btn">← Admin</Link>
            <Link href="/admin/bank/all" className="bl-btn">Question bank →</Link>
          </div>
        </header>

        <div className="rp-grid">
          {packs.map((p) => {
            const target = p.n ?? 100;
            const count = fill[p.pack_id] ?? 0;
            const pct = target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 0;
            return (
              <section key={p.pack_id} className="rp-card">
                <div className="rp-card-top">
                  <span className="rp-pack-id">{p.pack_id}</span>
                  <span className={`rp-status ${p.status}`}>
                    {p.published ? 'published' : p.status}
                  </span>
                </div>
                <h2 className="rp-title">{p.title}</h2>
                <div className="rp-fill-row">
                  <span className="rp-fill-count">
                    {count} <span className="of">/ {target} questions</span>
                  </span>
                </div>
                <div className="rp-fill-bar">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <div className="rp-meta">
                  <span>⏱ {formatTimeLimit(p.time_limit_sec)}</span>
                  <span>One shot · exam pace</span>
                </div>
              </section>
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
