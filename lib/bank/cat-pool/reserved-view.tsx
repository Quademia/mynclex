// mynclex/lib/bank/cat-pool/reserved-view.tsx
//
// The Reserved-stock pane (Slice 10b2-b): every question CAT can draw, and the
// only way to take one back out.
//
// FLAT by default — one row per question, wrapper shown as a chip — because
// that is what scans at a few thousand rows and what a search returns. Grouped
// only once the curator narrows to case or trend, where the wrapper structure
// is the thing they came to see (Sam's call).
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
import { releaseFromCatPool, releaseManyFromCatPool, type ReleaseTarget } from './actions';
import {
  buildStockUrl,
  resetLimit,
  releaseTargetFor,
  selectionKey,
  summariseSelection,
  STOCK_PAGE_SIZE,
  WARNING_LABEL,
  WARNING_TITLE,
  type StockGroup,
  type StockRow,
  type StockView,
  type SourceFilter,
} from './stock';

const BASE = '/admin/cat-pool';

const SOURCE_CHIP: Record<StockRow['source'], { label: string; cls: string }> = {
  standalone: { label: 'Standalone', cls: 'is-standalone' },
  case: { label: 'Case', cls: 'is-case' },
  trend: { label: 'Trend', cls: 'is-trend' },
};

type Single = { id: string; kind: ReleaseTarget; title: string | null; childCount: number };

export function ReservedStockView({
  groups,
  rows,
  grouped,
  allRows,
  view,
  total,
  shown,
  reserved,
  target,
  hasMore,
  remaining,
}: {
  /** Wrapper-grouped rows — used only when `grouped`. */
  groups: StockGroup[];
  /** The flat page of rows. */
  rows: StockRow[];
  grouped: boolean;
  /** Every reserved row, unfiltered — the selection summary counts against this. */
  allRows: StockRow[];
  view: StockView;
  total: number;
  shown: number;
  reserved: number;
  target: number;
  hasMore: boolean;
  remaining: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [single, setSingle] = useState<Single | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(view.q);

  const go = (next: StockView) => {
    router.replace(buildStockUrl(BASE, next), { scroll: false });
  };
  /** Any filter change resets the page size back to one page. */
  const setFilter = (patch: Partial<StockView>) => go(resetLimit({ ...view, ...patch }));

  const summary = summariseSelection(allRows, selected);

  const toggle = (row: StockRow) => {
    const key = selectionKey(row);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const done = (msg: string) => {
    setSingle(null);
    setBulkOpen(false);
    setSelected(new Set());
    setNotice(msg);
    router.refresh();
  };

  const doSingle = () => {
    if (!single) return;
    const t = single;
    startTransition(async () => {
      const res = await releaseFromCatPool(t.kind, t.id);
      if (res.ok) {
        done(
          t.kind === 'item'
            ? `Released ${t.id} — it is back in the practice pool.`
            : `Released ${t.id} and its ${t.childCount} child question${t.childCount === 1 ? '' : 's'}.`,
        );
      } else {
        setSingle(null);
        setError(res.error);
      }
    });
  };

  const doBulk = () => {
    startTransition(async () => {
      const res = await releaseManyFromCatPool(summary.targets);
      if (res.ok) {
        done(
          `Released ${res.released} reservation${res.released === 1 ? '' : 's'}` +
            (res.failed ? ` — ${res.failed} were already released.` : '.'),
        );
      } else {
        setBulkOpen(false);
        setError(res.error);
      }
    });
  };

  const askRelease = (row: StockRow) => {
    const t = releaseTargetFor(row);
    const childCount =
      t.kind === 'item' ? 0 : allRows.filter((r) => r.wrapperId === t.id).length;
    setSingle({ id: t.id, kind: t.kind, title: row.wrapperTitle, childCount });
  };

  const renderRow = (r: StockRow, insideGroup: boolean) => {
    const t = releaseTargetFor(r);
    const chip = SOURCE_CHIP[r.source];
    return (
      <div key={r.itemId} className="cp-row">
        <input
          type="checkbox"
          className="cp-row-check"
          aria-label={`Select ${r.itemId}`}
          checked={selected.has(selectionKey(r))}
          onChange={() => toggle(r)}
        />

        <span className={`cp-chip ${chip.cls}`}>{chip.label}</span>

        <div className="cp-row-main">
          <div className="cp-row-top">
            <span
              className={`cp-pubdot${r.isPublished ? ' is-live' : ''}`}
              title={r.isPublished ? 'Published' : 'Not yet published'}
            />
            <code className="cp-row-id">{r.itemId}</code>
            <span className="cp-type">{r.questionType}</span>
            {r.difficulty ? <span className="cp-diff">{r.difficulty}</span> : null}
            {/* Inside a wrapper group the wrapper id is the group header. */}
            {r.wrapperId && !insideGroup ? (
              <span className="cp-wrapref" title={r.wrapperTitle ?? undefined}>
                {r.wrapperId}
              </span>
            ) : null}
            {r.subcategory ? <span className="cp-subcat">{r.subcategory}</span> : null}
            {r.warnings.map((w) => (
              <span key={w} className={`cp-warn is-${w}`} title={WARNING_TITLE[w]}>
                {WARNING_LABEL[w]}
              </span>
            ))}
          </div>
          <div className="cp-row-stem">{r.stem || <em>No stem text</em>}</div>
        </div>

        <button
          type="button"
          className="cp-release"
          title={t.title}
          onClick={() => askRelease(r)}
        >
          {t.label}
        </button>
      </div>
    );
  };

  return (
    <section className="cp-card cp-stock">
      <div className="cp-stock-head">
        <div className="cp-card-head">
          <h3>Reserved stock</h3>
          <span className="cp-subhead">
            {shown.toLocaleString()} shown of {reserved.toLocaleString()} reserved · target{' '}
            {target.toLocaleString()}
          </span>
        </div>
        <p className="cp-note">
          Every question CAT can draw — reserved directly, or inherited from a reserved case or
          trend wrapper. Releasing a wrapper releases its children with it.
        </p>
      </div>

      <div className="cp-filters">
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
            placeholder="Search stem, ID or wrapper…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

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
          <span>Needs attention only</span>
        </label>

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

        <span className="cp-showing">{total.toLocaleString()} match</span>
      </div>

      {total === 0 ? (
        <p className="cp-empty">No reserved questions match these filters.</p>
      ) : grouped ? (
        <div className="cp-groups">
          {groups.map((g) => (
            <div key={g.wrapperId ?? 'standalone'} className="cp-group">
              {g.wrapperId && (
                <div className="cp-group-head">
                  <div>
                    <span className={`cp-chip ${SOURCE_CHIP[g.source].cls}`}>
                      {SOURCE_CHIP[g.source].label}
                    </span>
                    <code className="cp-group-id">{g.wrapperId}</code>
                    {g.title ? <span className="cp-group-title">{g.title}</span> : null}
                  </div>
                  <span className="cp-group-meta">
                    {g.rows.length} shown · reserved as a whole
                  </span>
                </div>
              )}
              <div className="cp-rows">{g.rows.map((r) => renderRow(r, true))}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="cp-rows cp-rows--flat">{rows.map((r) => renderRow(r, false))}</div>
      )}

      {hasMore && (
        <div className="cp-loadmore">
          <button
            type="button"
            className="cp-btn cp-btn--ghost"
            onClick={() => go({ ...view, limit: view.limit + STOCK_PAGE_SIZE })}
          >
            Load more <span className="cp-loadmore-n">{remaining.toLocaleString()} more</span>
          </button>
        </div>
      )}

      {summary.targets.length > 0 && (
        <div className="cp-selbar">
          <p>
            Released questions return to the practice pool immediately. Nothing is deleted — the
            tick simply comes off.
          </p>
          <button type="button" className="cp-link-btn" onClick={() => setSelected(new Set())}>
            Clear
          </button>
          <button type="button" className="cp-release" onClick={() => setBulkOpen(true)}>
            Release {summary.questionsAffected} selected
          </button>
        </div>
      )}

      {single && (
        <CatPoolReleaseConfirm
          id={single.id}
          kind={single.kind}
          title={single.title}
          childCount={single.childCount}
          pending={isPending}
          onCancel={() => setSingle(null)}
          onConfirm={doSingle}
        />
      )}

      {bulkOpen && (
        <CatPoolReleaseConfirm
          bulk={{
            standalone: summary.standalone,
            wrappers: summary.wrappers,
            questionsAffected: summary.questionsAffected,
          }}
          pending={isPending}
          onCancel={() => setBulkOpen(false)}
          onConfirm={doBulk}
        />
      )}

      <InfoToast message={notice} onDismiss={() => setNotice(null)} />
      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </section>
  );
}
