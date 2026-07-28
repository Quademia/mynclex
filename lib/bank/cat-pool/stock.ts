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
  /** Show only rows carrying at least one warning (the checkbox). */
  warnOnly: boolean;
  /**
   * Narrow to ONE warning condition. Set by the audit cards, which each need
   * their own subset — sending all three to a generic "has a warning" view
   * would land a curator on 2,800 rows regardless of which card they clicked.
   */
  warnType: StockWarning | null;
  /** Free text over item id and stem. */
  q: string;
  /** How many rows to draw; grows by STOCK_PAGE_SIZE via Load more. */
  limit: number;
};

const LENSES: LensKey[] = ['coverage', 'stock', 'audit'];
const SOURCES: SourceFilter[] = ['all', 'standalone', 'case', 'trend'];

const WARNINGS: StockWarning[] = ['builder', 'readiness', 'draft'];

export const DEFAULT_VIEW: StockView = {
  lens: 'coverage',
  source: 'all',
  difficulty: 'all',
  warnOnly: false,
  warnType: null,
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
  const warnType = one(params.wtype) as StockWarning;
  const rawLimit = Number.parseInt(one(params.limit), 10);

  return {
    lens: LENSES.includes(lens) ? lens : DEFAULT_VIEW.lens,
    source: SOURCES.includes(source) ? source : DEFAULT_VIEW.source,
    difficulty: one(params.diff) || DEFAULT_VIEW.difficulty,
    warnOnly: one(params.warn) === '1',
    warnType: WARNINGS.includes(warnType) ? warnType : null,
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
  if (view.warnType) p.set('wtype', view.warnType);
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

/**
 * Apply every filter in the view. Search covers item id, stem, and the
 * wrapper (id and title) — a curator looking for "the sepsis case" is
 * searching for the wrapper, not for any one of its six children.
 */
export function filterStock(rows: StockRow[], view: StockView): StockRow[] {
  const term = view.q.trim().toLowerCase();

  return rows.filter((r) => {
    if (view.source !== 'all' && r.source !== view.source) return false;
    if (view.difficulty !== 'all' && r.difficulty !== view.difficulty) return false;
    // A specific condition wins over the generic checkbox.
    if (view.warnType && !r.warnings.includes(view.warnType)) return false;
    if (!view.warnType && view.warnOnly && r.warnings.length === 0) return false;
    if (term) {
      const hay = `${r.itemId} ${r.stem ?? ''} ${r.wrapperId ?? ''} ${r.wrapperTitle ?? ''}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
}

/**
 * The list is FLAT by default — one row per question, wrapper shown as a chip
 * — because that is what scans at a few thousand rows and what a search
 * returns.
 *
 * Once the curator has narrowed to a single wrapper kind, though, they are
 * looking at a few hundred rows belonging to a few dozen wrappers, and the
 * wrapper structure is the thing they came to see. So group then, and only
 * then (Sam's call).
 */
export function shouldGroup(view: StockView): boolean {
  return view.source === 'case' || view.source === 'trend';
}

/**
 * What a row's release button does. An inherited row cannot be released on its
 * own — reservation lives on the wrapper (10b1) — so its button releases the
 * WRAPPER and says so.
 */
export function releaseTargetFor(row: StockRow): {
  kind: 'item' | 'case' | 'trend';
  id: string;
  label: string;
  title: string;
} {
  if (row.source === 'standalone') {
    return {
      kind: 'item',
      id: row.itemId,
      label: 'Release',
      title: 'Take this question out of the CAT pool and return it to practice.',
    };
  }
  return {
    kind: row.source,
    id: row.wrapperId ?? row.itemId,
    label: 'Release wrapper',
    title:
      'This question is reserved through its wrapper, so releasing it releases the whole wrapper and every child with it.',
  };
}

/** "142 shown of 2,834 reserved · target 2,880". */
export function poolHeadCount(shown: number, reserved: number, target: number): string {
  return `${shown.toLocaleString()} shown of ${reserved.toLocaleString()} reserved · target ${target.toLocaleString()}`;
}

// ── audit ────────────────────────────────────────────────────────────

export type AuditCounts = Record<StockWarning, number> & { anyWarning: number };

/**
 * How many reserved questions each condition affects.
 *
 * Counted from the same rows the stock pane lists, so a card and the list it
 * links to can never disagree — the "142 questions" on the card is literally
 * the length of the list the button opens.
 */
export function auditCounts(rows: StockRow[]): AuditCounts {
  const out: AuditCounts = { builder: 0, readiness: 0, draft: 0, anyWarning: 0 };
  for (const r of rows) {
    if (r.warnings.length) out.anyWarning++;
    for (const w of r.warnings) out[w]++;
  }
  return out;
}

// ── selection + bulk release ─────────────────────────────────────────

/**
 * The key a row selects. Ticking an inherited row selects its WRAPPER, so
 * ticking all six children of a case yields one target, not six — which is
 * also the only shape the release can take.
 */
export function selectionKey(row: StockRow): string {
  const t = releaseTargetFor(row);
  return `${t.kind}:${t.id}`;
}

export type SelectionSummary = {
  targets: { kind: 'item' | 'case' | 'trend'; id: string }[];
  standalone: number;
  wrappers: number;
  /** Every question that leaves the pool, including children swept in. */
  questionsAffected: number;
};

/**
 * What a bulk release would actually do.
 *
 * `questionsAffected` counts children of a selected wrapper even when those
 * children are not themselves ticked — and even when the current filter hides
 * them. A curator who selects one case row while filtered to "Hard" is
 * releasing all six of its children, not the one they can see, and the confirm
 * has to say the true number.
 */
export function summariseSelection(
  allRows: StockRow[],
  keys: Set<string>,
): SelectionSummary {
  const targets: SelectionSummary['targets'] = [];
  const seen = new Set<string>();
  let standalone = 0;
  let wrappers = 0;

  for (const row of allRows) {
    const key = selectionKey(row);
    if (!keys.has(key) || seen.has(key)) continue;
    seen.add(key);
    const t = releaseTargetFor(row);
    targets.push({ kind: t.kind, id: t.id });
    if (t.kind === 'item') standalone++;
    else wrappers++;
  }

  // Count against the FULL row set, not the filtered one.
  const questionsAffected = allRows.filter((r) => keys.has(selectionKey(r))).length;

  return { targets, standalone, wrappers, questionsAffected };
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
