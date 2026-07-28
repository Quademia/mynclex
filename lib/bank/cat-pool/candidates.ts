// mynclex/lib/bank/cat-pool/candidates.ts
//
// Pure logic for the reserve drawer (Slice 10b2-d): what may be reserved,
// what may not, and the facet filtering over it.
//
// The drawer offers PUBLISHED, practice-eligible stock only. An unpublished
// question can be ticked into the pool through the editor, but offering it
// here would be inviting the very thing the audit lens complains about — a
// reservation that can never be served.

import {
  QUESTION_TYPES,
  CLIENT_NEEDS_BLUEPRINT_RANGES,
  CLIENT_NEEDS_SHORT_LABELS,
  DIFFICULTY_LEVELS,
  BODY_SYSTEMS,
  NURSING_SUBJECTS,
  BLOOM_LEVELS,
} from '@/lib/bank/classifications';

/** Which stock the drawer is showing. */
export type CandidateTab = 'questions' | 'cases' | 'trends';

/** A standalone question that could be reserved. */
export type CandidateQuestion = {
  itemId: string;
  questionType: string;
  stem: string;
  difficulty: string | null;
  subcategory: string | null;
  bodySystem: string | null;
  nursingSubject: string | null;
  bloomLevel: string | null;
  /** Already reserved for a readiness pack — offered but not selectable. */
  readinessTagged: boolean;
};

/** A case or trend wrapper that could be reserved whole. */
export type CandidateWrapper = {
  wrapperId: string;
  kind: 'case' | 'trend';
  title: string;
  /** Published children — what actually joins the pool. */
  childCount: number;
  /** Distinct difficulty bands across its children, for the preview line. */
  bands: string[];
  /** Any child is readiness-tagged, so the wrapper cannot be reserved. */
  readinessTagged: boolean;
};

// ── the mutual-exclusivity guard (§20.5) ─────────────────────────────

/**
 * A question serves one purpose or the other, never both — whichever comes
 * second is measuring an item the student has already answered.
 *
 * 10b1 stored reservation as a boolean rather than the UNIQUE table §20.2
 * planned, so the guard cannot be a database constraint. Enforcing it here
 * stops NEW conflicts being created, which is the half that matters: nothing
 * is double-reserved today, and this keeps it that way.
 */
export function isBlocked(c: { readinessTagged: boolean }): boolean {
  return c.readinessTagged;
}

export const BLOCKED_BADGE = 'In a readiness pack';
export const BLOCKED_NOTE =
  'Readiness-reserved — release it from its pack first. A question can only serve one purpose.';

// ── facets ───────────────────────────────────────────────────────────

export type FacetKey = 'type' | 'subcat' | 'diff' | 'sys' | 'subject' | 'bloom';

export type FacetDef = {
  key: FacetKey;
  label: string;
  options: string[];
  /** Compact display labels, where the stored value is long. */
  short?: Record<string, string>;
};

export const FACET_DEFS: FacetDef[] = [
  // QUESTION_TYPES carries { value, label } pairs; the facet filters on the
  // stored value, so take that and keep the code as the display label.
  { key: 'type', label: 'Type', options: QUESTION_TYPES.map((t) => t.value) },
  {
    key: 'subcat',
    label: 'Client Needs',
    options: Object.keys(CLIENT_NEEDS_BLUEPRINT_RANGES),
    short: CLIENT_NEEDS_SHORT_LABELS,
  },
  { key: 'diff', label: 'Difficulty', options: [...DIFFICULTY_LEVELS] },
  { key: 'sys', label: 'Body system', options: [...BODY_SYSTEMS] },
  { key: 'subject', label: 'Nursing subject', options: [...NURSING_SUBJECTS] },
  { key: 'bloom', label: 'Bloom level', options: [...BLOOM_LEVELS] },
];

export type Facets = Record<FacetKey, string[]>;

export const EMPTY_FACETS: Facets = {
  type: [], subcat: [], diff: [], sys: [], subject: [], bloom: [],
};

/** How many individual options are ticked across every facet. */
export function facetCount(f: Facets): number {
  return Object.values(f).reduce((n, list) => n + list.length, 0);
}

export function hasAnyFacet(f: Facets): boolean {
  return facetCount(f) > 0;
}

/** One chip per ticked option, so each can be removed individually. */
export function facetChips(f: Facets): { key: FacetKey; value: string; label: string }[] {
  const out: { key: FacetKey; value: string; label: string }[] = [];
  for (const def of FACET_DEFS) {
    for (const value of f[def.key]) {
      out.push({ key: def.key, value, label: def.short?.[value] ?? value });
    }
  }
  return out;
}

export function toggleFacet(f: Facets, key: FacetKey, value: string): Facets {
  const list = f[key];
  return {
    ...f,
    [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
  };
}

/** "Any" when nothing is ticked, else the count — the collapsed summary. */
export function facetSummary(f: Facets, key: FacetKey): string {
  const n = f[key].length;
  return n === 0 ? 'Any' : `${n} selected`;
}

// ── filtering ────────────────────────────────────────────────────────

/** An empty facet means "any", so an unticked axis never excludes anything. */
const matches = (selected: string[], value: string | null): boolean =>
  selected.length === 0 || (value !== null && selected.includes(value));

export function filterQuestions(
  rows: CandidateQuestion[],
  facets: Facets,
  search: string,
): CandidateQuestion[] {
  const term = search.trim().toLowerCase();
  return rows.filter((q) => {
    if (!matches(facets.type, q.questionType)) return false;
    if (!matches(facets.subcat, q.subcategory)) return false;
    if (!matches(facets.diff, q.difficulty)) return false;
    if (!matches(facets.sys, q.bodySystem)) return false;
    if (!matches(facets.subject, q.nursingSubject)) return false;
    if (!matches(facets.bloom, q.bloomLevel)) return false;
    if (term && !`${q.itemId} ${q.stem}`.toLowerCase().includes(term)) return false;
    return true;
  });
}

/**
 * Wrappers carry no classification of their own, so only the text search
 * applies — the facets describe questions, and a wrapper is reserved whole.
 */
export function filterWrappers(rows: CandidateWrapper[], search: string): CandidateWrapper[] {
  const term = search.trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((w) => `${w.wrapperId} ${w.title}`.toLowerCase().includes(term));
}

// ── selection ────────────────────────────────────────────────────────

/**
 * Select-all applies to what is VISIBLE and selectable — never to blocked
 * rows, and never to the whole candidate set behind the filters. Ticking a
 * box labelled "select all" should not reserve a thousand questions a curator
 * has not looked at.
 */
export function selectableIds(rows: { itemId: string; readinessTagged: boolean }[]): string[] {
  return rows.filter((r) => !isBlocked(r)).map((r) => r.itemId);
}

export function allSelected(visible: string[], picked: Set<string>): boolean {
  return visible.length > 0 && visible.every((id) => picked.has(id));
}

/** "Reserve 12" / "Reserve" when nothing is picked. */
export function commitLabel(n: number): string {
  return n === 0 ? 'Reserve' : `Reserve ${n.toLocaleString()}`;
}
