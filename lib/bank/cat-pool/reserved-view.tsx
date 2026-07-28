// mynclex/lib/bank/cat-pool/reserved-view.tsx
//
// The Reserved-stock pane (Slice 10b2-b): every question CAT can draw, and the
// only way to take one back out.
//
// Filters and the page size live in the URL, matching the bank lists — so a
// Load more is a soft navigation, and the pane survives a refresh. Changing a
// filter resets the limit, otherwise narrowing the set would keep refetching a
// page size chosen for a much larger one.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DIFFICULTY_LEVELS } from '@/lib/bank/classifications';
import { InfoToast } from '@/lib/toast/info-toast';
import { ErrorToast } from '@/lib/toast/error-toast';
import { CatPoolReleaseConfirm } from '@/lib/overlays/bank/cat-pool-release-confirm';
import { releaseFromCatPool, type ReleaseTarget } from './actions';
import {
  buildStockUrl,
  resetLimit,
  STOCK_PAGE_SIZE,
  WARNING_LABEL,
  WARNING_TITLE,
  type StockGroup,
  type StockView,
  type SourceFilter,
} from './stock';

const BASE = '/admin/cat-pool';

type PendingRelease = {
  id: string;
  kind: ReleaseTarget;
  title: string | null;
  childCount: number;
};

export function ReservedStockView({
  groups,
  view,
  total,
  shown,
  hasMore,
  remaining,
}: {
  groups: StockGroup[];
  view: StockView;
  total: number;
  shown: number;
  hasMore: boolean;
  remaining: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<PendingRelease | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(view.q);

  /** Any filter change resets the page size back to one page. */
  const go = (next: StockView) => {
    router.replace(buildStockUrl(BASE, next), { scroll: false });
  };
  const setFilter = (patch: Partial<StockView>) => go(resetLimit({ ...view, ...patch }));

  const loadMore = () => go({ ...view, limit: view.limit + STOCK_PAGE_SIZE });

  const doRelease = () => {
    if (!confirming) return;
    const target = confirming;
    startTransition(async () => {
      const res = await releaseFromCatPool(target.kind, target.id);
      setConfirming(null);
      if (res.ok) {
        setNotice(
          target.kind === 'item'
            ? `Released ${target.id} — it is back in the practice pool.`
            : `Released ${target.id} and its ${target.childCount} child question${
                target.childCount === 1 ? '' : 's'
              }.`,
        );
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <section className="cp-stock">
      <div className="cp-filters">
        <select
          aria-label="Source"
          value={view.source}
          onChange={(e) => setFilter({ source: e.target.value as SourceFilter })}
        >
          <option value="all">All sources</option>
          <option value="standalone">Standalone</option>
          <option value="case">Case questions</option>
          <option value="trend">Trend questions</option>
        </select>

        <select
          aria-label="Difficulty"
          value={view.difficulty}
          onChange={(e) => setFilter({ difficulty: e.target.value })}
        >
          <option value="all">All difficulties</option>
          {DIFFICULTY_LEVELS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <label className="cp-check">
          <input
            type="checkbox"
            checked={view.warnOnly}
            onChange={(e) => setFilter({ warnOnly: e.target.checked })}
          />
          Needs attention only
        </label>

        <form
          className="cp-search"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter({ q: search.trim() });
          }}
        >
          <input
            type="search"
            aria-label="Search reserved questions"
            placeholder="Search id or stem…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        {(view.source !== 'all' || view.difficulty !== 'all' || view.warnOnly || view.q) && (
          <button
            type="button"
            className="cp-link-btn"
            onClick={() => {
              setSearch('');
              go(resetLimit({ ...view, source: 'all', difficulty: 'all', warnOnly: false, q: '' }));
            }}
          >
            Clear
          </button>
        )}

        <span className="cp-showing">
          Showing {shown.toLocaleString()} of {total.toLocaleString()}
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="cp-empty">No reserved questions match these filters.</p>
      ) : (
        <div className="cp-groups">
          {groups.map((g) => (
            <div key={g.wrapperId ?? 'standalone'} className="cp-group">
              {g.wrapperId && (
                <div className="cp-group-head">
                  <div>
                    <span className={`cp-chip is-${g.source}`}>
                      {g.source === 'case' ? 'Case' : 'Trend'}
                    </span>
                    <code className="cp-group-id">{g.wrapperId}</code>
                    {g.title ? <span className="cp-group-title">{g.title}</span> : null}
                  </div>
                  <div className="cp-group-right">
                    <span className="cp-group-meta">
                      {g.rows.length} child question{g.rows.length === 1 ? '' : 's'} inherited
                    </span>
                    <button
                      type="button"
                      className="cp-btn cp-btn--danger"
                      onClick={() =>
                        setConfirming({
                          id: g.wrapperId!,
                          kind: g.source === 'case' ? 'case' : 'trend',
                          title: g.title,
                          childCount: g.rows.length,
                        })
                      }
                    >
                      Release
                    </button>
                  </div>
                </div>
              )}

              <ul className="cp-rows">
                {g.rows.map((r) => (
                  <li key={r.itemId} className="cp-row">
                    <div className="cp-row-main">
                      <div className="cp-row-top">
                        <code className="cp-row-id">{r.itemId}</code>
                        <span className="cp-type">{r.questionType}</span>
                        {r.difficulty ? <span className="cp-diff">{r.difficulty}</span> : null}
                        {r.warnings.map((w) => (
                          <span key={w} className={`cp-warn is-${w}`} title={WARNING_TITLE[w]}>
                            {WARNING_LABEL[w]}
                          </span>
                        ))}
                      </div>
                      <p className="cp-row-stem">{r.stem || <em>No stem text</em>}</p>
                    </div>

                    {/* Inherited rows carry no action — reservation is the
                        wrapper's, so the group header owns the release. */}
                    {r.source === 'standalone' ? (
                      <button
                        type="button"
                        className="cp-btn cp-btn--ghost"
                        onClick={() =>
                          setConfirming({ id: r.itemId, kind: 'item', title: null, childCount: 0 })
                        }
                      >
                        Release
                      </button>
                    ) : (
                      <span className="cp-inherited" title="Reserved through its wrapper">
                        inherited
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="cp-loadmore">
          <button type="button" className="cp-btn cp-btn--ghost" onClick={loadMore}>
            Load more <span className="cp-loadmore-n">{remaining.toLocaleString()} more</span>
          </button>
        </div>
      )}

      <p className="cp-note">
        Released questions return to the practice pool immediately. Nothing is deleted — the tick
        simply comes off.
      </p>

      {confirming && (
        <CatPoolReleaseConfirm
          id={confirming.id}
          kind={confirming.kind}
          title={confirming.title}
          childCount={confirming.childCount}
          pending={isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={doRelease}
        />
      )}

      <InfoToast message={notice} onDismiss={() => setNotice(null)} />
      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </section>
  );
}
