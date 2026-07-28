// mynclex/lib/bank/cat-pool/stock.ts
//
// Pure logic for the Reserved-stock pane (Slice 10b2-b): the three warning
// conditions, the filters, wrapper grouping, and the URL view.
//
// None of this touches the database or React, so the rules a curator acts on
// — "this row is a draft and CAT will never serve it" — can be asserted
// directly rather than inferred from a rendered page.

import type { PoolItemRow } from './queries';

/** Rows are drawn 50 at a time, matching the bank lists (BANK_PAGE_SIZE). */
export const STOCK_PAGE_SIZE = 50;

/**
 * The three ways a reserved question quietly degrades the pool. None of them
 * stop a sitting; each makes it slightly worse, which is why they are surfaced
 * as row badges and counted in the Audit pane rather than blocking anything.
 */
export type StockWarning = 'builder' | 'readiness' | 'draft';

export const WARNING_LABEL: Record<StockWarning, string> = {
  builder: 'visible in builder',
  readiness: 'readiness-tagged',
  draft: 'draft',
};

export const WARNING_TITLE: Record<StockWarning, string> = {
  builder:
    'Reserved for CAT but still offered in the student practice builder, so a student can meet it before the exam.',
  readiness:
    'Also reserved for a readiness pack. A question can only honestly serve one purpose.',
  draft: 'Not published — CAT will not serve it, but it still counts against the target.',
};

/**
 * Which warnings apply to a row.
 *
 * Note `builder` fires on almost the whole pool today: nothing has ever
 * cleared builder visibility on reservation, and selection does not yet honour
 * `cat_pool` at all. That is the expected state before the selection slice,
 * not a fault in the data.
 */
export function warningsFor(row: PoolItemRow): StockWarning[] {
  const out: StockWarning[] = [];
  if (row.isBuilderVisible) out.push('builder');
  if (row.readinessTagged) out.push('readiness');
  if (!row.isPublished) out.push('draft');
  return out;
}

// ── the URL view ─────────────────────────────────────────────────────

export type LensKey = 'coverage' | 'stock' | 'audit';
export type SourceFilter = 'all' | 'standalone' | 'case' | 'trend';

export type StockView = {
  lens: LensKey;
  source: SourceFilter;
  /** A difficulty band label, or 'all'. */
  difficulty: string;
  /** Show only rows carrying at least one warning. */
  warnOnly: boolean;
  /** Free text over item id and stem. */
  q: string;
  /** How many rows to draw; grows by STOCK_PAGE_SIZE via Load more. */
  limit: number;
};

const LENSES: LensKey[] = ['coverage', 'stock', 'audit'];
const SOURCES: SourceFilter[] = ['all', 'standalone', 'case', 'trend'];

export const DEFAULT_VIEW: StockView = {
  lens: 'coverage',
  source: 'all',
  difficulty: 'all',
  warnOnly: false,
  q: '',
  limit: STOCK_PAGE_SIZE,
};

const one = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Read the view out of searchParams. Every field falls back to its default, so
 * a hand-edited or truncated URL degrades to the overview rather than erroring.
 */
export function parseStockView(params: Record<string, string | string[] | undefined>): StockView {
  const lens = one(params.lens) as LensKey;
  const source = one(params.src) as SourceFilter;
  const rawLimit = Number.parseInt(one(params.limit), 10);

  return {
    lens: LENSES.includes(lens) ? lens : DEFAULT_VIEW.lens,
    source: SOURCES.includes(source) ? source : DEFAULT_VIEW.source,
    difficulty: one(params.diff) || DEFAULT_VIEW.difficulty,
    warnOnly: one(params.warn) === '1',
    q: one(params.q).trim(),
    limit: Number.isFinite(rawLimit)
      ? Math.max(STOCK_PAGE_SIZE, rawLimit)
      : DEFAULT_VIEW.limit,
  };
}

/** Serialise a view back to a URL, omitting anything at its default. */
export function buildStockUrl(base: string, view: StockView): string {
  const p = new URLSearchParams();
  if (view.lens !== DEFAULT_VIEW.lens) p.set('lens', view.lens);
  if (view.source !== DEFAULT_VIEW.source) p.set('src', view.source);
  if (view.difficulty !== DEFAULT_VIEW.difficulty) p.set('diff', view.difficulty);
  if (view.warnOnly) p.set('warn', '1');
  if (view.q) p.set('q', view.q);
  if (view.limit !== DEFAULT_VIEW.limit) p.set('limit', String(view.limit));
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Changing what is being looked at resets the page size — otherwise a curator
 * who had loaded 500 rows then narrowed the filter would silently refetch 500
 * rows of a much smaller set.
 */
export function resetLimit(view: StockView): StockView {
  return { ...view, limit: STOCK_PAGE_SIZE };
}

// ── filtering + grouping ─────────────────────────────────────────────

/** A row with its warnings resolved, ready to render. */
export type StockRow = PoolItemRow & {
  warnings: StockWarning[];
  /** Wrapper title for inherited rows, for the group header. */
  wrapperTitle: string | null;
};

export function toStockRows(
  rows: PoolItemRow[],
  wrapperTitles: Record<string, string>,
): StockRow[] {
  return rows.map((r) => ({
    ...r,
    warnings: warningsFor(r),
    wrapperTitle: r.wrapperId ? (wrapperTitles[r.wrapperId] ?? null) : null,
  }));
}

/** Apply every filter in the view. Search matches item id or stem, case-insensitively. */
export function filterStock(rows: StockRow[], view: StockView): StockRow[] {
  const term = view.q.trim().toLowerCase();

  return rows.filter((r) => {
    if (view.source !== 'all' && r.source !== view.source) return false;
    if (view.difficulty !== 'all' && r.difficulty !== view.difficulty) return false;
    if (view.warnOnly && r.warnings.length === 0) return false;
    if (term) {
      const hay = `${r.itemId} ${r.stem ?? ''}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
}

export type StockGroup = {
  /** Wrapper id, or null for the standalone group. */
  wrapperId: string | null;
  title: string | null;
  source: PoolItemRow['source'];
  rows: StockRow[];
};

/**
 * Group inherited rows under their wrapper and leave standalone rows loose.
 *
 * Reservation lives on the wrapper, so the wrapper is the unit a curator
 * releases — the group header carries the action, and its children are shown
 * as consequences rather than as individually-revocable rows.
 */
export function groupStock(rows: StockRow[]): StockGroup[] {
  const standalone: StockRow[] = [];
  const byWrapper = new Map<string, StockGroup>();

  for (const r of rows) {
    if (!r.wrapperId) {
      standalone.push(r);
      continue;
    }
    let g = byWrapper.get(r.wrapperId);
    if (!g) {
      g = { wrapperId: r.wrapperId, title: r.wrapperTitle, source: r.source, rows: [] };
      byWrapper.set(r.wrapperId, g);
    }
    g.rows.push(r);
  }

  return [
    ...(standalone.length
      ? [{ wrapperId: null, title: null, source: 'standalone' as const, rows: standalone }]
      : []),
    ...byWrapper.values(),
  ];
}

/**
 * The page the view asks for, plus the TRUE total.
 *
 * `total` is deliberately the count of everything matching the filters, not
 * the number of rows returned — the header reads "Showing 50 of 2,834", and a
 * list whose whole job is to be an accurate inventory must never imply the
 * fetched page is the whole set.
 */
export function pageStock(rows: StockRow[], view: StockView): {
  rows: StockRow[];
  total: number;
  hasMore: boolean;
  remaining: number;
} {
  const total = rows.length;
  const shown = rows.slice(0, view.limit);
  return {
    rows: shown,
    total,
    hasMore: shown.length < total,
    remaining: total - shown.length,
  };
}
