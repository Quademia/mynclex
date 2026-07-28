import { describe, it, expect } from 'vitest';
import {
  isBlocked,
  facetCount,
  hasAnyFacet,
  facetChips,
  toggleFacet,
  facetSummary,
  filterQuestions,
  filterWrappers,
  selectableIds,
  allSelected,
  commitLabel,
  EMPTY_FACETS,
  FACET_DEFS,
  type CandidateQuestion,
  type CandidateWrapper,
  type Facets,
} from './candidates';

const q = (over: Partial<CandidateQuestion> = {}): CandidateQuestion => ({
  itemId: 'NCLEX_MCQ_00001',
  questionType: 'MCQ',
  stem: 'A nurse is caring for a client with sepsis.',
  difficulty: 'Medium',
  subcategory: 'Management of Care',
  bodySystem: 'Cardiovascular',
  nursingSubject: 'Medical-Surgical',
  bloomLevel: 'Apply',
  readinessTagged: false,
  ...over,
});

const w = (over: Partial<CandidateWrapper> = {}): CandidateWrapper => ({
  wrapperId: 'NCLEX_CS_00042',
  kind: 'case',
  title: 'Deteriorating post-operative client',
  childCount: 6,
  bands: ['Medium', 'Hard'],
  readinessTagged: false,
  ...over,
});

const facets = (over: Partial<Facets> = {}): Facets => ({ ...EMPTY_FACETS, ...over });

describe('isBlocked — the mutual-exclusivity guard', () => {
  it('blocks a readiness-reserved question', () => {
    expect(isBlocked(q({ readinessTagged: true }))).toBe(true);
  });

  it('allows anything else', () => {
    expect(isBlocked(q())).toBe(false);
  });

  it('blocks a wrapper when any child is readiness-tagged', () => {
    expect(isBlocked(w({ readinessTagged: true }))).toBe(true);
  });
});

describe('facets', () => {
  it('starts empty', () => {
    expect(facetCount(EMPTY_FACETS)).toBe(0);
    expect(hasAnyFacet(EMPTY_FACETS)).toBe(false);
  });

  it('counts every ticked option across all axes', () => {
    const f = facets({ type: ['MCQ', 'SATA'], diff: ['Hard'] });
    expect(facetCount(f)).toBe(3);
    expect(hasAnyFacet(f)).toBe(true);
  });

  it('toggles an option on and back off', () => {
    let f = toggleFacet(EMPTY_FACETS, 'diff', 'Hard');
    expect(f.diff).toEqual(['Hard']);
    f = toggleFacet(f, 'diff', 'Hard');
    expect(f.diff).toEqual([]);
  });

  it('does not disturb the other axes', () => {
    const f = toggleFacet(facets({ type: ['MCQ'] }), 'diff', 'Hard');
    expect(f.type).toEqual(['MCQ']);
  });

  it('emits one removable chip per ticked option, with short labels', () => {
    const chips = facetChips(facets({ subcat: ['Management of Care'], diff: ['Hard'] }));
    expect(chips).toHaveLength(2);
    expect(chips.find((c) => c.key === 'subcat')!.label).toBe('Mgmt of Care');
  });

  it('summarises a collapsed axis', () => {
    expect(facetSummary(EMPTY_FACETS, 'type')).toBe('Any');
    expect(facetSummary(facets({ type: ['MCQ', 'SATA'] }), 'type')).toBe('2 selected');
  });

  it('offers all six axes', () => {
    expect(FACET_DEFS.map((d) => d.key)).toEqual(['type', 'subcat', 'diff', 'sys', 'subject', 'bloom']);
    expect(FACET_DEFS.every((d) => d.options.length > 0)).toBe(true);
  });
});

describe('filterQuestions', () => {
  const rows = [
    q({ itemId: 'A1', questionType: 'MCQ', difficulty: 'Easy' }),
    q({ itemId: 'B1', questionType: 'SATA', difficulty: 'Hard', subcategory: 'Physiological Adaptation' }),
    q({ itemId: 'C1', questionType: 'MCQ', difficulty: 'Hard', stem: 'Insulin titration overnight' }),
  ];

  it('returns everything when no facet is set — empty means any', () => {
    expect(filterQuestions(rows, EMPTY_FACETS, '')).toHaveLength(3);
  });

  it('filters on a single axis', () => {
    expect(filterQuestions(rows, facets({ diff: ['Hard'] }), '').map((r) => r.itemId)).toEqual(['B1', 'C1']);
  });

  it('ANDs across axes', () => {
    const got = filterQuestions(rows, facets({ diff: ['Hard'], type: ['MCQ'] }), '');
    expect(got.map((r) => r.itemId)).toEqual(['C1']);
  });

  it('ORs within an axis', () => {
    const got = filterQuestions(rows, facets({ type: ['MCQ', 'SATA'] }), '');
    expect(got).toHaveLength(3);
  });

  it('searches id and stem, case-insensitively', () => {
    expect(filterQuestions(rows, EMPTY_FACETS, 'INSULIN').map((r) => r.itemId)).toEqual(['C1']);
  });

  it('excludes a row whose value is null on a filtered axis', () => {
    const withNull = [q({ itemId: 'N1', difficulty: null })];
    expect(filterQuestions(withNull, facets({ diff: ['Hard'] }), '')).toHaveLength(0);
  });
});

describe('filterWrappers', () => {
  const rows = [w({ wrapperId: 'CS_1', title: 'Sepsis case' }), w({ wrapperId: 'TR_1', kind: 'trend', title: 'Insulin chart' })];

  it('searches id and title', () => {
    expect(filterWrappers(rows, 'sepsis').map((r) => r.wrapperId)).toEqual(['CS_1']);
    expect(filterWrappers(rows, 'TR_').map((r) => r.wrapperId)).toEqual(['TR_1']);
  });

  it('returns everything for an empty search', () => {
    expect(filterWrappers(rows, '  ')).toHaveLength(2);
  });
});

describe('selection', () => {
  it('never offers a blocked row to select-all', () => {
    const rows = [q({ itemId: 'A1' }), q({ itemId: 'A2', readinessTagged: true }), q({ itemId: 'A3' })];
    expect(selectableIds(rows)).toEqual(['A1', 'A3']);
  });

  it('is "all selected" only when every visible selectable row is picked', () => {
    expect(allSelected(['A1', 'A3'], new Set(['A1']))).toBe(false);
    expect(allSelected(['A1', 'A3'], new Set(['A1', 'A3']))).toBe(true);
  });

  it('is not "all selected" when nothing is visible', () => {
    expect(allSelected([], new Set())).toBe(false);
  });

  it('labels the commit button with the count', () => {
    expect(commitLabel(0)).toBe('Reserve');
    expect(commitLabel(1)).toBe('Reserve 1');
    expect(commitLabel(1200)).toBe('Reserve 1,200');
  });
});
