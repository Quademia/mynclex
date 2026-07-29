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
  shouldGroup,
  releaseTargetFor,
  summariseSelection,
  auditCounts,
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
  // The seed for 'Medium'. A band with no number is no longer a reachable
  // state — the trigger in 20260824120000 fills it on every write — so a
  // fixture that left this null was modelling a row that cannot exist, and
  // would now read as unplaceable in every test that expects a clean row.
  difficultyIrt: 0,
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
    const v = parseStockView({
      lens: 'stock', src: 'case', diff: 'Hard', warn: '1', wtype: 'draft', q: ' sepsis ', limit: '150',
    });
    expect(v).toEqual({
      lens: 'stock', source: 'case', difficulty: 'Hard',
      warnOnly: true, warnType: 'draft', q: 'sepsis', limit: 150,
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

describe('warnType — the audit deep-links', () => {
  const rows = toStockRows(
    [
      item({ itemId: 'A1', isBuilderVisible: true }),
      item({ itemId: 'A2', isPublished: false }),
      item({ itemId: 'A3', readinessTagged: true }),
      item({ itemId: 'A4' }),
    ],
    {},
  );

  it('narrows to one condition rather than "any warning"', () => {
    expect(filterStock(rows, view({ warnType: 'builder' })).map((r) => r.itemId)).toEqual(['A1']);
    expect(filterStock(rows, view({ warnType: 'draft' })).map((r) => r.itemId)).toEqual(['A2']);
    expect(filterStock(rows, view({ warnType: 'readiness' })).map((r) => r.itemId)).toEqual(['A3']);
  });

  it('wins over the generic checkbox', () => {
    const got = filterStock(rows, view({ warnOnly: true, warnType: 'draft' }));
    expect(got.map((r) => r.itemId)).toEqual(['A2']);
  });

  it('round-trips through the URL', () => {
    const v = view({ lens: 'stock', warnType: 'readiness' });
    const params = Object.fromEntries(new URL(buildStockUrl('/x', v), 'http://h').searchParams);
    expect(parseStockView(params).warnType).toBe('readiness');
  });

  it('ignores an unknown condition', () => {
    expect(parseStockView({ wtype: 'sideways' }).warnType).toBeNull();
  });
});

describe('auditCounts', () => {
  it('counts each condition, and rows carrying any', () => {
    const rows = toStockRows(
      [
        item({ itemId: 'A1', isBuilderVisible: true }),
        item({ itemId: 'A2', isBuilderVisible: true, isPublished: false }),
        item({ itemId: 'A3', readinessTagged: true }),
        item({ itemId: 'A4' }),
      ],
      {},
    );
    expect(auditCounts(rows)).toEqual({
      builder: 2, draft: 1, readiness: 1, unplaceable: 0,
      anyWarning: 3,   // A4 is clean
    });
  });

  it('is all zeroes for a clean pool', () => {
    expect(auditCounts(toStockRows([item()], {}))).toEqual({
      builder: 0, readiness: 0, draft: 0, unplaceable: 0, anyWarning: 0,
    });
  });

  it('counts an unplaceable row — the condition the DB check no longer catches', () => {
    // A case child is exempt from the placeability constraint on purpose (the
    // cascade trigger would otherwise make an unplaceable child unsaveable),
    // so this lens is where it has to become visible.
    const rows = toStockRows(
      [
        item({ itemId: 'B1', source: 'case', wrapperId: 'CS_1', difficulty: null, difficultyIrt: null }),
        item({ itemId: 'B2', source: 'case', wrapperId: 'CS_1', subcategory: null }),
        item({ itemId: 'B3', source: 'case', wrapperId: 'CS_1' }),
      ],
      {},
    );
    const counts = auditCounts(rows);
    expect(counts.unplaceable).toBe(2);
    expect(counts.anyWarning).toBe(2);
  });

  it('counts a row with a band but no calibrated number — the column CAT selects on', () => {
    // The state the 622-item gap-fill run left behind: a curator's word with
    // no number under it. Every membership test screened on the word, so the
    // pool counted 11 of these and the engine could serve none of them.
    const rows = toStockRows(
      [item({ itemId: 'A1', difficulty: 'Hard', difficultyIrt: null })],
      {},
    );
    expect(warningsFor(rows[0])).toEqual(['unplaceable']);
    expect(auditCounts(rows).unplaceable).toBe(1);
  });

  it('agrees with the list its card links to', () => {
    const rows = toStockRows(
      Array.from({ length: 7 }, (_, i) => item({ itemId: `Q${i}`, isBuilderVisible: i < 5 })),
      {},
    );
    const counts = auditCounts(rows);
    const listed = filterStock(rows, view({ warnType: 'builder' }));
    expect(listed).toHaveLength(counts.builder);
  });
});

describe('shouldGroup', () => {
  it('is flat for a mixed list', () => {
    expect(shouldGroup(DEFAULT_VIEW)).toBe(false);
    expect(shouldGroup(view({ source: 'standalone' }))).toBe(false);
  });

  it('groups once narrowed to a single wrapper kind', () => {
    expect(shouldGroup(view({ source: 'case' }))).toBe(true);
    expect(shouldGroup(view({ source: 'trend' }))).toBe(true);
  });
});

describe('releaseTargetFor', () => {
  const rows = toStockRows(
    [
      item({ itemId: 'A1' }),
      item({ itemId: 'B1', source: 'case', wrapperId: 'CS_1' }),
    ],
    { CS_1: 'Sepsis case' },
  );

  it('releases a standalone row on its own', () => {
    const t = releaseTargetFor(rows[0]);
    expect(t).toMatchObject({ kind: 'item', id: 'A1', label: 'Release' });
  });

  it('releases the CASE for one of its children, and says so', () => {
    const t = releaseTargetFor(rows[1]);
    expect(t.kind).toBe('case');
    expect(t.id).toBe('CS_1');           // not B1
    expect(t.label).toBe('Release case');
  });

  it('releases a TREND question on its own — a dataset is not a unit', () => {
    // The whole point of the regrain: reserving and releasing happen per
    // question, so releasing one leaves its siblings on the same chart alone.
    const trend = toStockRows(
      [item({ itemId: 'C1', source: 'trend', wrapperId: 'TR_1' })],
      { TR_1: 'Insulin chart' },
    )[0];
    const t = releaseTargetFor(trend);
    expect(t.kind).toBe('item');
    expect(t.id).toBe('C1');             // not TR_1
    expect(t.label).toBe('Release');
    expect(t.title).toContain('unaffected');
  });
});

describe('summariseSelection', () => {
  const rows = toStockRows(
    [
      item({ itemId: 'A1' }),
      item({ itemId: 'A2' }),
      item({ itemId: 'B1', source: 'case', wrapperId: 'CS_1' }),
      item({ itemId: 'B2', source: 'case', wrapperId: 'CS_1' }),
      item({ itemId: 'B3', source: 'case', wrapperId: 'CS_1' }),
      item({ itemId: 'C1', source: 'trend', wrapperId: 'TR_1' }),
    ],
    { CS_1: 'Sepsis case', TR_1: 'Insulin chart' },
  );

  it('collapses every child of a wrapper to ONE release target', () => {
    const keys = new Set(['case:CS_1']);
    const s = summariseSelection(rows, keys);
    expect(s.targets).toEqual([{ kind: 'case', id: 'CS_1' }]);
    expect(s.wrappers).toBe(1);
    expect(s.standalone).toBe(0);
  });

  it('counts every question swept in, not just the ticked row', () => {
    // Selecting one case row takes all three of its children out.
    const s = summariseSelection(rows, new Set(['case:CS_1']));
    expect(s.questionsAffected).toBe(3);
  });

  it('mixes standalone, trend and case targets', () => {
    // A trend row selects ITSELF (`item:C1`), not its dataset — so this is
    // two individual questions plus one case, not three wrappers.
    const s = summariseSelection(rows, new Set(['item:A1', 'item:C1', 'case:CS_1']));
    expect(s.standalone).toBe(2);
    expect(s.wrappers).toBe(1);
    expect(s.questionsAffected).toBe(1 + 1 + 3);
    expect(s.targets).toHaveLength(3);
  });

  it('never collapses trend questions onto their dataset', () => {
    // Two questions on one chart are two separate releases.
    const sameChart = toStockRows(
      [
        item({ itemId: 'C1', source: 'trend', wrapperId: 'TR_1' }),
        item({ itemId: 'C2', source: 'trend', wrapperId: 'TR_1' }),
      ],
      { TR_1: 'Insulin chart' },
    );
    const s = summariseSelection(sameChart, new Set(['item:C1', 'item:C2']));
    expect(s.targets).toEqual([
      { kind: 'item', id: 'C1' },
      { kind: 'item', id: 'C2' },
    ]);
    expect(s.wrappers).toBe(0);
  });

  it('is empty for an empty selection', () => {
    const s = summariseSelection(rows, new Set());
    expect(s).toEqual({ targets: [], standalone: 0, wrappers: 0, questionsAffected: 0 });
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
