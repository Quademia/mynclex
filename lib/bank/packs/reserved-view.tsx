// mynclex/lib/bank/packs/reserved-view.tsx
//
// The reserved-stock lens (Slice ③, readiness-packs.md §4/§8): every
// readiness-reserved question with its pack assignment ("Pack 3" /
// "unassigned") — the how-far-to-500 bookkeeping view. One-shot
// server load, client-side filtering (the picker's pattern; volume is
// bounded by the reserve itself). A reserved row that is still
// builder-visible gets a leak warning — the §4 tag-and-hide rule made
// visible.

'use client';

import { useMemo, useState } from 'react';
import type { ReservedRow, ReservedStock } from './types';

const DIFF_CLASS: Record<string, string> = {
  Easy: 'easy',
  Medium: 'medium',
  Hard: 'hard',
};

const SOURCE_LABEL: Record<ReservedRow['source'], string> = {
  standalone: 'Standalone',
  case: 'Case',
  trend: 'Trend',
};

export function ReservedStockView({ stock }: { stock: ReservedStock }) {
  const [search, setSearch] = useState('');
  const [assign, setAssign] = useState<'all' | 'unassigned' | number>('all');
  const [source, setSource] = useState<'all' | ReservedRow['source']>('all');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return stock.rows.filter(
      (r) =>
        (assign === 'all' ||
          (assign === 'unassigned' ? r.packNum === null : r.packNum === assign)) &&
        (source === 'all' || r.source === source) &&
        (!term ||
          `${r.stemLabel} ${r.itemId} ${r.wrapperId ?? ''}`.toLowerCase().includes(term)),
    );
  }, [stock.rows, search, assign, source]);

  const assigned = stock.rows.filter((r) => r.packNum !== null).length;
  const leaks = stock.rows.filter((r) => r.isBuilderVisible).length;

  return (
    <section className="rp-members rp-reserved">
      <div className="rp-members-head">
        <div className="rp-members-head-top">
          <h3>Reserved stock</h3>
          <span>
            {stock.rows.length} reserved · target {stock.target}
          </span>
        </div>
        <p>
          Every readiness-reserved question — tagged directly, inside a tagged
          case, or placed in a pack. {assigned} assigned ·{' '}
          {stock.rows.length - assigned} unassigned
          {leaks > 0 && (
            <span className="rp-reserved-leak-note">
              {' '}· ⚠ {leaks} still visible in the student builder
            </span>
          )}
        </p>
      </div>

      <div className="rp-reserved-toolbar">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search stem, ID or wrapper…"
        />
        <select
          value={String(assign)}
          onChange={(e) => {
            const v = e.target.value;
            setAssign(v === 'all' || v === 'unassigned' ? v : Number(v));
          }}
        >
          <option value="all">All packs</option>
          <option value="unassigned">Unassigned</option>
          {stock.packNums.map((n) => (
            <option key={n} value={n}>Pack {n}</option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
        >
          <option value="all">All sources</option>
          <option value="standalone">Standalone</option>
          <option value="case">Case questions</option>
          <option value="trend">Trend questions</option>
        </select>
        <span className="rp-dim">{filtered.length} match</span>
      </div>

      {stock.rows.length === 0 ? (
        <div className="rp-members-empty">
          <div className="rp-members-empty-title">Nothing reserved yet</div>
          <p>
            Questions join the reserve when you tag them <code>readiness</code>{' '}
            on the bank list, or automatically the moment they enter a pack.
          </p>
        </div>
      ) : (
        <div className="rp-members-rows">
          {filtered.length === 0 && (
            <div className="rp-pk-empty">No reserved questions match these filters.</div>
          )}
          {filtered.map((r) => (
            <div key={r.itemId} className="rp-q-row rp-reserved-row">
              <span
                className={`rp-assign-chip ${r.packNum === null ? 'none' : ''}`}
                title={
                  r.packNum === null
                    ? 'Reserved but not yet placed in a pack'
                    : `Placed in Pack ${r.packNum}`
                }
              >
                {r.packNum === null ? 'unassigned' : `Pack ${r.packNum}`}
              </span>
              <div className="rp-row-main">
                <div className="rp-row-chips">
                  <span
                    className={`rp-pub-dot ${r.isPublished ? 'pub' : 'unpub'}`}
                    title={r.isPublished ? 'Published' : 'Not yet published'}
                  />
                  <span className="rp-mono">{r.itemId}</span>
                  <span className="rp-type-chip">{r.questionType}</span>
                  {r.difficulty && (
                    <span className={`rp-diff ${DIFF_CLASS[r.difficulty] ?? ''}`}>
                      {r.difficulty}
                    </span>
                  )}
                  {r.source !== 'standalone' && (
                    <span className={`rp-kind-chip ${r.source}`}>
                      {SOURCE_LABEL[r.source].toUpperCase()}
                    </span>
                  )}
                  {r.wrapperId && <span className="rp-dim">{r.wrapperId}</span>}
                  {r.subcategory && <span className="rp-dim">{r.subcategory}</span>}
                  {r.isBuilderVisible && (
                    <span
                      className="rp-pk-badge"
                      title="Reserved but still exposed in the student practice builder — hide it (the tag-and-hide rule)"
                    >
                      ⚠ visible in builder
                    </span>
                  )}
                </div>
                {r.stemLabel && <div className="rp-stem">{r.stemLabel}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
