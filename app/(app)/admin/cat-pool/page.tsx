// mynclex/app/(app)/admin/cat-pool/page.tsx
//
// Admin CAT-pool management page — Slice 10b2 (bank-consumption-cat.html
// §20.4 / §20.5). The reserved stock CAT draws from, and how far it is from
// carrying a full set of adaptive exams.
//
// Top-level, not a child of /admin/bank — this is ALLOCATION, not authoring.
// It mirrors Readiness Packs (/admin/packs + lib/bank/packs/), the other
// surface that carves reserved stock out of the bank for one delivery mode.
//
// This slice ships the Coverage lens. The Reserved-stock and Audit lenses,
// and the reserve drawer, land in 10b2-b / 10b2-c / 10b2-d.
//
// ⚠ Reservation is not yet ENFORCED anywhere — `cat_pool` is written by the
// editor tick (10b1) and read here, but nothing selects on it. CAT still draws
// from the whole eligible bank and reserved questions still appear in student
// practice. That is 10b3's job, and the copy on this page is careful not to
// claim otherwise.

import Link from 'next/link';
import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import { loadPoolSnapshot } from '@/lib/bank/cat-pool/queries';
import {
  buildStatCards,
  buildSpreadRows,
  buildBlueprintRows,
  buildSupplyRows,
} from '@/lib/bank/cat-pool/coverage';
import {
  parseStockView,
  buildStockUrl,
  resetLimit,
  toStockRows,
  filterStock,
  groupStock,
  pageStock,
  type LensKey,
} from '@/lib/bank/cat-pool/stock';
import { ReservedStockView } from '@/lib/bank/cat-pool/reserved-view';
import { SITTINGS_FLOOR } from '@/lib/bank/cat-pool/constants';
import { CoverageLens } from './coverage-lens';

export const dynamic = 'force-dynamic';

const PILLS: { key: LensKey; label: string }[] = [
  { key: 'coverage', label: 'Coverage' },
  { key: 'stock', label: 'Reserved stock' },
  { key: 'audit', label: 'Audit' },
];

export default async function CatPoolPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  const view = parseStockView(await searchParams);
  const { counts, items, wrapperTitles } = await loadPoolSnapshot(supabase);

  const statCards = buildStatCards(counts);
  const setSpread = buildSpreadRows(counts, 'set');
  const calibratedSpread = buildSpreadRows(counts, 'calibrated');
  const blueprintRows = buildBlueprintRows(counts);
  const supplyRows = buildSupplyRows(counts);
  const calibratedCount = Object.values(counts.byCalibratedBand).reduce((a, b) => a + b, 0);

  // The stock pane reads the SAME snapshot the coverage pane aggregates — one
  // load, three views — so filtering and paging are in-memory and the pane
  // switch costs nothing.
  const allRows = toStockRows(items, wrapperTitles);
  const filtered = filterStock(allRows, view);
  const page = pageStock(filtered, view);
  const groups = groupStock(page.rows);

  return (
    <div className="cp-page">
      <header className="cp-header">
        <div className="cp-crumbs">
          <Link href="/admin/dashboard">Admin</Link>
          <span aria-hidden="true">›</span>
          <span>CAT pool</span>
        </div>

        <div className="cp-header-main">
          <div>
            <h1>CAT pool</h1>
            <p className="cp-lede">
              Questions reserved for the adaptive exam. The pool has to carry its own spread of
              difficulty and blueprint coverage, because a CAT draws its whole sitting from here.
              Targets below are the {SITTINGS_FLOOR}-CAT floor: guidance, never a gate.
            </p>
          </div>
          <div className="cp-header-actions">
            <Link href="/admin/bank/all" className="cp-btn cp-btn--ghost">
              Question bank →
            </Link>
          </div>
        </div>

        <p className="cp-pending">
          <strong>Not yet enforced.</strong> Reserving writes the flag and this page reads it, but
          selection does not use it yet — CAT still draws from the whole bank, and reserved
          questions still appear in student practice. That lands with the selection slice.
        </p>

        <nav className="cp-pills" aria-label="CAT pool views">
          {PILLS.map((p) => (
            <Link
              key={p.key}
              href={buildStockUrl('/admin/cat-pool', resetLimit({ ...view, lens: p.key }))}
              className={`cp-pill${view.lens === p.key ? ' is-on' : ''}`}
              aria-current={view.lens === p.key ? 'page' : undefined}
            >
              {p.label}
              {p.key === 'stock' && (
                <span className="cp-pill-n">{counts.standalone + counts.caseChildren + counts.trendChildren}</span>
              )}
            </Link>
          ))}
        </nav>
      </header>

      {view.lens === 'coverage' && (
        <CoverageLens
          statCards={statCards}
          setSpread={setSpread}
          calibratedSpread={calibratedSpread}
          blueprintRows={blueprintRows}
          supplyRows={supplyRows}
          calibratedCount={calibratedCount}
        />
      )}

      {view.lens === 'stock' && (
        <ReservedStockView
          groups={groups}
          view={view}
          total={page.total}
          shown={page.rows.length}
          hasMore={page.hasMore}
          remaining={page.remaining}
        />
      )}

      {view.lens === 'audit' && (
        <section className="cp-card">
          <p className="cp-note">The Audit lens lands in the next sub-slice.</p>
        </section>
      )}
    </div>
  );
}
