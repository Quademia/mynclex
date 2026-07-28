import { describe, it, expect } from 'vitest';
import {
  warningsFor,
  parseStockView,
  buildStockUrl,
  resetLimit,
  toStockRows,
  filterStock,
  groupStock,
  pageStock,
  DEFAULT_VIEW,
  STOCK_PAGE_SIZE,
  type StockView,
} from './stock';
import type { PoolItemRow } from './queries';

const item = (over: Partial<PoolItemRow> = {}): PoolItemRow => ({
  itemId: 'NCLEX_MCQ_00001',
  questionType: 'MCQ',
  source: 'standalone',
  wrapperId: null,
  stem: 'A nurse is caring for a client.',
  difficulty: 'Medium',
  difficultyIrt: null,
  difficultySource: 'CURATOR_LABEL',
  subcategory: 'Management of Care',
  isPublished: true,
  isBuilderVisible: false,
  readinessTagged: false,
  ...over,
});

const view = (over: Partial<StockView> = {}): StockView => ({ ...DEFAULT_VIEW, ...over });

describe('warningsFor', () => {
  it('is empty for a clean reserved row', () => {
    expect(warningsFor(item())).toEqual([]);
  });

  it('flags a row still offered in the practice builder', () => {
    expect(warningsFor(item({ isBuilderVisible: true }))).toContain('builder');
  });

  it('flags a row reserved for a readiness pack as well', () => {
    expect(warningsFor(item({ readinessTagged: true }))).toContain('readiness');
  });

  it('flags an unpublished row — CAT will never serve it', () => {
    expect(warningsFor(item({ isPublished: false }))).toContain('draft');
  });

  it('reports every condition that applies, not just the first', () => {
    const w = warningsFor(item({ isBuilderVisible: true, readinessTagged: true, isPublished: false }));
    expect(w).toEqual(['builder', 'readiness', 'draft']);
  });
});

describe('parseStockView', () => {
  it('falls back to the overview for an empty query string', () => {
    expect(parseStockView({})).toEqual(DEFAULT_VIEW);
  });

  it('reads every field', () => {
    const v = parseStockView({ lens: 'stock', src: 'case', diff: 'Hard', warn: '1', q: ' sepsis ', limit: '150' });
    expect(v).toEqual({
      lens: 'stock', source: 'case', difficulty: 'Hard', warnOnly: true, q: 'sepsis', limit: 150,
    });
  });

  it('ignores an unknown lens or source rather than erroring', () => {
    const v = parseStockView({ lens: 'nonsense', src: 'sideways' });
    expect(v.lens).toBe('coverage');
    expect(v.source).toBe('all');
  });

  it('never returns a limit below one page', () => {
    expect(parseStockView({ limit: '3' }).limit).toBe(STOCK_PAGE_SIZE);
    expect(parseStockView({ limit: 'banana' }).limit).toBe(STOCK_PAGE_SIZE);
  });

  it('takes the first value when a param repeats', () => {
    expect(parseStockView({ lens: ['stock', 'audit'] }).lens).toBe('stock');
  });
});

describe('buildStockUrl', () => {
  it('omits defaults so a plain view has a clean URL', () => {
    expect(buildStockUrl('/admin/cat-pool', DEFAULT_VIEW)).toBe('/admin/cat-pool');
  });

  it('round-trips through parse', () => {
    const v = view({ lens: 'stock', source: 'trend', difficulty: 'Very hard', warnOnly: true, q: 'insulin', limit: 200 });
    const url = buildStockUrl('/admin/cat-pool', v);
    const params = Object.fromEntries(new URL(url, 'http://x').searchParams);
    expect(parseStockView(params)).toEqual(v);
  });
});

describe('resetLimit', () => {
  it('drops back to one page when the filters change', () => {
    expect(resetLimit(view({ limit: 500 })).limit).toBe(STOCK_PAGE_SIZE);
  });

  it('leaves everything else alone', () => {
    const v = view({ lens: 'stock', q: 'sepsis', limit: 500 });
    expect(resetLimit(v)).toEqual({ ...v, limit: STOCK_PAGE_SIZE });
  });
});

describe('filterStock', () => {
  const rows = toStockRows(
    [
      item({ itemId: 'A1', source: 'standalone', difficulty: 'Easy' }),
      item({ itemId: 'B1', source: 'case', wrapperId: 'CS_1', difficulty: 'Hard', isBuilderVisible: true }),
      item({ itemId: 'C1', source: 'trend', wrapperId: 'TR_1', difficulty: 'Hard', stem: 'Insulin titration' }),
    ],
    { CS_1: 'Sepsis case', TR_1: 'Insulin chart' },
  );

  it('returns everything by default', () => {
    expect(filterStock(rows, DEFAULT_VIEW)).toHaveLength(3);
  });

  it('filters by source', () => {
    expect(filterStock(rows, view({ source: 'case' })).map((r) => r.itemId)).toEqual(['B1']);
  });

  it('filters by difficulty band', () => {
    expect(filterStock(rows, view({ difficulty: 'Hard' })).map((r) => r.itemId)).toEqual(['B1', 'C1']);
  });

  it('filters to rows carrying a warning', () => {
    expect(filterStock(rows, view({ warnOnly: true })).map((r) => r.itemId)).toEqual(['B1']);
  });

  it('searches item id and stem, case-insensitively', () => {
    expect(filterStock(rows, view({ q: 'INSULIN' })).map((r) => r.itemId)).toEqual(['C1']);
    expect(filterStock(rows, view({ q: 'a1' })).map((r) => r.itemId)).toEqual(['A1']);
  });

  it('combines filters', () => {
    expect(filterStock(rows, view({ difficulty: 'Hard', warnOnly: true })).map((r) => r.itemId)).toEqual(['B1']);
  });
});

describe('groupStock', () => {
  it('keeps standalone rows loose and groups inherited rows by wrapper', () => {
    const rows = toStockRows(
      [
        item({ itemId: 'A1' }),
        item({ itemId: 'B1', source: 'case', wrapperId: 'CS_1' }),
        item({ itemId: 'B2', source: 'case', wrapperId: 'CS_1' }),
        item({ itemId: 'C1', source: 'trend', wrapperId: 'TR_1' }),
      ],
      { CS_1: 'Sepsis case', TR_1: 'Insulin chart' },
    );
    const groups = groupStock(rows);

    expect(groups).toHaveLength(3);
    expect(groups[0].wrapperId).toBeNull();
    expect(groups[0].rows.map((r) => r.itemId)).toEqual(['A1']);

    const sepsis = groups.find((g) => g.wrapperId === 'CS_1')!;
    expect(sepsis.title).toBe('Sepsis case');
    expect(sepsis.rows).toHaveLength(2);
  });

  it('omits the standalone group entirely when there are none', () => {
    const rows = toStockRows([item({ itemId: 'B1', source: 'case', wrapperId: 'CS_1' })], { CS_1: 'x' });
    expect(groupStock(rows).every((g) => g.wrapperId !== null)).toBe(true);
  });
});

describe('pageStock', () => {
  const many = toStockRows(
    Array.from({ length: 120 }, (_, i) => item({ itemId: `Q${i}` })),
    {},
  );

  it('draws one page but reports the TRUE total', () => {
    const p = pageStock(many, DEFAULT_VIEW);
    expect(p.rows).toHaveLength(STOCK_PAGE_SIZE);
    expect(p.total).toBe(120);          // not 50 — the header must not lie
    expect(p.hasMore).toBe(true);
    expect(p.remaining).toBe(70);
  });

  it('grows with the limit', () => {
    const p = pageStock(many, view({ limit: 100 }));
    expect(p.rows).toHaveLength(100);
    expect(p.remaining).toBe(20);
  });

  it('stops offering more once everything is shown', () => {
    const p = pageStock(many, view({ limit: 500 }));
    expect(p.rows).toHaveLength(120);
    expect(p.hasMore).toBe(false);
    expect(p.remaining).toBe(0);
  });

  it('handles an empty set without going negative', () => {
    const p = pageStock([], DEFAULT_VIEW);
    expect(p.total).toBe(0);
    expect(p.hasMore).toBe(false);
    expect(p.remaining).toBe(0);
  });
});
