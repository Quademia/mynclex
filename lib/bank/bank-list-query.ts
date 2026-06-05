// mynclex/lib/bank/bank-list-query.ts
//
// Shared filter logic for the bank list pages (/admin/bank/all and the
// tutor twin). One source of truth for: the filter value shape, the URL
// param names, parse ↔ serialize, and applying the filters to a Supabase
// query. Both pages + the filter bar import from here.
//
// FACETED filtering: the fixed-list axes are MULTI-select — within a
// filter the chosen values are OR'd (Type ∈ {MCQ, TF}); across filters
// everything is AND'd. On/off axes (Status, Free sample, Builder-visible)
// stay single. Free-text fields are reached via the SCOPED SEARCH.

import {
  CLIENT_NEEDS_CATEGORIES,
  CLIENT_NEEDS_SUBCATEGORIES,
} from '@/lib/bank/classifications';

export interface BankFilterValues {
  // Multi-select (OR within) → string[]
  type:           string[];  // question_type
  category:       string[];  // client_needs_category
  subcategory:    string[];  // client_needs_subcategory
  subject:        string[];  // nursing_subject
  bodySystem:     string[];  // body_system
  difficulty:     string[];  // difficulty
  bloom:          string[];  // bloom_level
  membership:     string[];  // subset of standalone | case | trend
  tag:            string[];  // tags (array overlap)
  // Single (on/off)
  status:         string;    // '' | 'published' | 'draft'
  freeSample:     string;    // '' | 'yes' | 'no'
  builderVisible: string;    // '' | 'yes' | 'no'
  // Scoped search — one term, OR-matched across the chosen fields.
  q:              string;    // search text
  qf:             string[];  // search scopes — see SEARCH_SCOPES
}

// Which BankFilterValues keys are multi-select arrays.
const MULTI_FIELDS = [
  'type', 'category', 'subcategory', 'subject', 'bodySystem',
  'difficulty', 'bloom', 'membership', 'tag',
] as const;
type MultiField = (typeof MULTI_FIELDS)[number];

// Multi field → DB column (for the `in` query). membership + tag are
// special (handled separately) so they're omitted here.
const COLUMN_OF: Partial<Record<MultiField, string>> = {
  type:        'question_type',
  category:    'client_needs_category',
  subcategory: 'client_needs_subcategory',
  subject:     'nursing_subject',
  bodySystem:  'body_system',
  difficulty:  'difficulty',
  bloom:       'bloom_level',
};

// Scoped search: which column the search box matches.
export const SEARCH_SCOPES = [
  { value: 'stem',        label: 'Stem',        column: 'stem' },
  { value: 'instruction', label: 'Instruction', column: 'instruction' },
  { value: 'rationale',   label: 'Rationale',   column: 'rationale' },
  { value: 'item_id',     label: 'Item ID',     column: 'item_id' },
  { value: 'ref',         label: 'Ref',         column: 'question_ref' },
  { value: 'topic',       label: 'Topic',       column: 'topic' },
  { value: 'subtopic',    label: 'Subtopic',    column: 'subtopic' },
  { value: 'batch',       label: 'Batch',       column: 'batch_id' },
] as const;

const DEFAULT_SCOPE = SEARCH_SCOPES[0].value; // 'stem'

// ── URL param ↔ value mapping (one place) ─────────────────────────
const PARAM_OF: Record<keyof BankFilterValues, string> = {
  type:           'type',
  category:       'category',
  subcategory:    'subcategory',
  subject:        'subject',
  bodySystem:     'body_system',
  difficulty:     'difficulty',
  bloom:          'bloom',
  membership:     'membership',
  tag:            'tag',
  status:         'status',
  freeSample:     'free_sample',
  builderVisible: 'builder_visible',
  q:              'q',
  qf:             'qf',
};

const isMulti = (k: keyof BankFilterValues): k is MultiField =>
  (MULTI_FIELDS as readonly string[]).includes(k);

export function parseBankFilters(
  sp: Record<string, string | undefined>,
): BankFilterValues {
  const arr = (k: MultiField) =>
    (sp[PARAM_OF[k]] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    type:           arr('type'),
    category:       arr('category'),
    subcategory:    arr('subcategory'),
    subject:        arr('subject'),
    bodySystem:     arr('bodySystem'),
    difficulty:     arr('difficulty'),
    bloom:          arr('bloom'),
    membership:     arr('membership'),
    tag:            arr('tag'),
    status:         sp[PARAM_OF.status] ?? '',
    freeSample:     sp[PARAM_OF.freeSample] ?? '',
    builderVisible: sp[PARAM_OF.builderVisible] ?? '',
    q:              sp[PARAM_OF.q] ?? '',
    qf:             parseScopes(sp[PARAM_OF.qf]),
  };
}

function parseScopes(raw: string | undefined): string[] {
  const valid = new Set<string>(SEARCH_SCOPES.map((s) => s.value));
  const got = (raw ?? '').split(',').map((s) => s.trim()).filter((s) => valid.has(s));
  return got.length ? got : [DEFAULT_SCOPE];
}

/** Serialise to a query string, omitting empties (and `qf` unless it
 *  actually narrows a non-default search). */
export function serializeBankFilters(f: BankFilterValues): string {
  const p = new URLSearchParams();
  (Object.keys(PARAM_OF) as (keyof BankFilterValues)[]).forEach((k) => {
    if (isMulti(k)) {
      const v = f[k];
      if (v.length) p.set(PARAM_OF[k], v.join(','));
      return;
    }
    if (k === 'qf') {
      const isDefault = f.qf.length === 1 && f.qf[0] === DEFAULT_SCOPE;
      if (f.q && f.qf.length && !isDefault) p.set('qf', f.qf.join(','));
      return;
    }
    const v = f[k];
    if (v) p.set(PARAM_OF[k], v);
  });
  return p.toString();
}

/** Any filter active? (qf alone doesn't count — only a real query does.) */
export function hasAnyBankFilter(f: BankFilterValues): boolean {
  return (
    MULTI_FIELDS.some((k) => f[k].length > 0) ||
    Boolean(f.status || f.freeSample || f.builderVisible || f.q)
  );
}

export function emptyBankFilters(): BankFilterValues {
  return {
    type: [], category: [], subcategory: [], subject: [], bodySystem: [],
    difficulty: [], bloom: [], membership: [], tag: [],
    status: '', freeSample: '', builderVisible: '', q: '', qf: [DEFAULT_SCOPE],
  };
}

// ── Active-filter chips (one per chosen value) ────────────────────
export interface ActiveFilterChip {
  field: keyof BankFilterValues;  // which field to clear / remove from
  value?: string;                 // for multi fields: the specific value
  label: string;                  // human label on the chip
}

const SCOPE_LABEL: Record<string, string> = Object.fromEntries(
  SEARCH_SCOPES.map((s) => [s.value, s.label]),
);

const MULTI_PREFIX: Partial<Record<MultiField, string>> = {
  type:  'Type',
  bloom: 'Bloom',
  tag:   'Tag',
};

export function describeActiveFilters(f: BankFilterValues): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  // Multi fields — one chip per value.
  for (const k of MULTI_FIELDS) {
    for (const v of f[k]) {
      const prefix = k === 'membership' ? '' : MULTI_PREFIX[k];
      const label = k === 'membership' ? membershipLabel(v) : prefix ? `${prefix}: ${v}` : v;
      chips.push({ field: k, value: v, label });
    }
  }
  // Single fields.
  if (f.status)         chips.push({ field: 'status',         label: f.status === 'published' ? 'Published' : 'Draft' });
  if (f.freeSample)     chips.push({ field: 'freeSample',     label: f.freeSample === 'yes' ? 'Free sample' : 'Not free sample' });
  if (f.builderVisible) chips.push({ field: 'builderVisible', label: f.builderVisible === 'yes' ? 'Builder-visible' : 'Hidden from builder' });
  if (f.q) {
    const where = (f.qf.length ? f.qf : [DEFAULT_SCOPE])
      .map((s) => SCOPE_LABEL[s] ?? s)
      .join(', ');
    chips.push({ field: 'q', label: `“${f.q}” in ${where}` });
  }
  return chips;
}

function membershipLabel(m: string): string {
  if (m === 'standalone') return 'Standalone';
  if (m === 'case')       return 'Case-linked';
  if (m === 'trend')      return 'Trend-linked';
  return m;
}

// ── Apply filters to a Supabase query ─────────────────────────────
// Generic over the query builder. Does NOT apply membership (that needs
// an OR-group — see applyMembershipFilter, called by the page).
interface FilterableQuery<Q> {
  eq:       (column: string, value: string | boolean) => Q;
  in:       (column: string, values: string[]) => Q;
  ilike:    (column: string, value: string) => Q;
  overlaps: (column: string, value: string[]) => Q;
  or:       (filters: string) => Q;
}

export function applyBankFilters<Q extends FilterableQuery<Q>>(
  query: Q,
  f: BankFilterValues,
): Q {
  let q = query;
  // Multi list axes → IN (OR within the axis).
  for (const k of Object.keys(COLUMN_OF) as MultiField[]) {
    const values = f[k];
    if (values.length) q = q.in(COLUMN_OF[k]!, values);
  }
  // Tags → array overlap (rows having ANY of the chosen tags).
  if (f.tag.length) q = q.overlaps('tags', f.tag);
  // Single on/off axes.
  if (f.status === 'published') q = q.eq('is_published', true);
  if (f.status === 'draft')     q = q.eq('is_published', false);
  if (f.freeSample === 'yes')   q = q.eq('is_free_sample', true);
  if (f.freeSample === 'no')    q = q.eq('is_free_sample', false);
  if (f.builderVisible === 'yes') q = q.eq('is_builder_visible', true);
  if (f.builderVisible === 'no')  q = q.eq('is_builder_visible', false);
  // Scoped search — one term, OR-matched across the chosen field(s).
  if (f.q) {
    const scopes = f.qf.length ? f.qf : [DEFAULT_SCOPE];
    const cols = scopes
      .map((s) => SEARCH_SCOPES.find((x) => x.value === s)?.column as string | undefined)
      .filter((c): c is string => Boolean(c));
    if (cols.length <= 1) {
      // Single field — safe parameterised ilike.
      q = q.ilike(cols[0] ?? 'stem', `%${f.q}%`);
    } else {
      // Multiple fields — one OR group. Sanitise the term (strip the
      // chars that would break PostgREST's or() parser) and use its `*`
      // wildcard syntax.
      const safe = f.q.replace(/[,()"]/g, ' ').trim();
      if (safe) q = q.or(cols.map((c) => `${c}.ilike.*${safe}*`).join(','));
    }
  }
  return q;
}

// Membership is OR'd across the chosen kinds, AND'd with the rest. Each
// kind maps to a condition on the two nullable wrapper FKs; we build one
// PostgREST or() group. Empty or all-three = no constraint.
export function applyMembershipFilter<Q extends { or: (filters: string) => Q }>(
  query: Q,
  membership: string[],
): Q {
  if (membership.length === 0 || membership.length >= 3) return query;
  const parts: string[] = [];
  if (membership.includes('standalone')) parts.push('and(parent_case_id.is.null,trend_id.is.null)');
  if (membership.includes('case'))       parts.push('parent_case_id.not.is.null');
  if (membership.includes('trend'))      parts.push('trend_id.not.is.null');
  return query.or(parts.join(','));
}

// Re-exported so callers needn't import classifications just for these.
export { CLIENT_NEEDS_CATEGORIES, CLIENT_NEEDS_SUBCATEGORIES };
