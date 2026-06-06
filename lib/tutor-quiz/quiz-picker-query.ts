// mynclex/lib/tutor-quiz/quiz-picker-query.ts
//
// Filter logic for the quiz editor's question picker. Mirrors the shape
// of lib/bank/bank-list-query.ts (faceted multi-select + scoped search +
// active chips + parse↔serialize↔apply) but TAILORED to the picker's
// hard scope: the tutor's own PUBLISHED, STANDALONE questions only. So
// there's no Status / Membership / Free-sample / Builder-visible axis —
// those are fixed by the scope and would mislead if shown. Not shared
// with the bank: the bank list and the picker are different surfaces
// (the picker adds questions to a quiz; the bank list edits them).
//
// FACETED: within a facet the chosen values are OR'd (Type ∈ {MCQ, TF});
// across facets everything is AND'd. The free-text columns are reached
// through the SCOPED SEARCH.

export interface QuizPickerFilters {
  // Multi-select (OR within) → string[]
  type:        string[]; // question_type
  category:    string[]; // client_needs_category
  subcategory: string[]; // client_needs_subcategory
  subject:     string[]; // nursing_subject
  bodySystem:  string[]; // body_system
  difficulty:  string[]; // difficulty
  bloom:       string[]; // bloom_level
  tag:         string[]; // tags (array overlap)
  // Scoped search — one term, OR-matched across the chosen field(s).
  q:           string;
  qf:          string[]; // search scopes — see PICKER_SEARCH_SCOPES
}

const MULTI_FIELDS = [
  'type', 'category', 'subcategory', 'subject', 'bodySystem',
  'difficulty', 'bloom', 'tag',
] as const;
type MultiField = (typeof MULTI_FIELDS)[number];

// Multi field → DB column (for the `in` query). `tag` is special
// (array overlap) so it's omitted here.
const COLUMN_OF: Partial<Record<MultiField, string>> = {
  type:        'question_type',
  category:    'client_needs_category',
  subcategory: 'client_needs_subcategory',
  subject:     'nursing_subject',
  bodySystem:  'body_system',
  difficulty:  'difficulty',
  bloom:       'bloom_level',
};

// Scoped search — content columns a tutor finds questions by. The
// bank-admin scopes (item_id / ref / batch) are dropped: the picker is
// about finding questions by what they SAY, not by their metadata.
export const PICKER_SEARCH_SCOPES = [
  { value: 'stem',        label: 'Stem',        column: 'stem' },
  { value: 'instruction', label: 'Instruction', column: 'instruction' },
  { value: 'rationale',   label: 'Rationale',   column: 'rationale' },
  { value: 'topic',       label: 'Topic',       column: 'topic' },
  { value: 'subtopic',    label: 'Subtopic',    column: 'subtopic' },
] as const;

const DEFAULT_SCOPE = PICKER_SEARCH_SCOPES[0].value; // 'stem'

// ── URL param ↔ value mapping (one place) ─────────────────────────
const PARAM_OF: Record<keyof QuizPickerFilters, string> = {
  type:        'type',
  category:    'category',
  subcategory: 'subcategory',
  subject:     'subject',
  bodySystem:  'body_system',
  difficulty:  'difficulty',
  bloom:       'bloom',
  tag:         'tag',
  q:           'q',
  qf:          'qf',
};

const isMulti = (k: keyof QuizPickerFilters): k is MultiField =>
  (MULTI_FIELDS as readonly string[]).includes(k);

export function parseQuizPickerFilters(
  sp: Record<string, string | undefined>,
): QuizPickerFilters {
  const arr = (k: MultiField) =>
    (sp[PARAM_OF[k]] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    type:        arr('type'),
    category:    arr('category'),
    subcategory: arr('subcategory'),
    subject:     arr('subject'),
    bodySystem:  arr('bodySystem'),
    difficulty:  arr('difficulty'),
    bloom:       arr('bloom'),
    tag:         arr('tag'),
    q:           sp[PARAM_OF.q] ?? '',
    qf:          parseScopes(sp[PARAM_OF.qf]),
  };
}

function parseScopes(raw: string | undefined): string[] {
  const valid = new Set<string>(PICKER_SEARCH_SCOPES.map((s) => s.value));
  const got = (raw ?? '')
    .split(',').map((s) => s.trim()).filter((s) => valid.has(s));
  return got.length ? got : [DEFAULT_SCOPE];
}

/** Serialise to a query string, omitting empties (and `qf` unless it
 *  actually narrows a non-default search). */
export function serializeQuizPickerFilters(f: QuizPickerFilters): string {
  const p = new URLSearchParams();
  (Object.keys(PARAM_OF) as (keyof QuizPickerFilters)[]).forEach((k) => {
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
export function hasAnyQuizFilter(f: QuizPickerFilters): boolean {
  return MULTI_FIELDS.some((k) => f[k].length > 0) || Boolean(f.q);
}

export function emptyQuizPickerFilters(): QuizPickerFilters {
  return {
    type: [], category: [], subcategory: [], subject: [], bodySystem: [],
    difficulty: [], bloom: [], tag: [], q: '', qf: [DEFAULT_SCOPE],
  };
}

export function buildQuizPickerUrl(
  baseUrl: string,
  f: QuizPickerFilters,
): string {
  const s = serializeQuizPickerFilters(f);
  return s ? `${baseUrl}?${s}` : baseUrl;
}

// ── Active-filter chips (one per chosen value) ────────────────────
export interface QuizFilterChip {
  field: keyof QuizPickerFilters;
  value?: string;
  label: string;
}

const SCOPE_LABEL: Record<string, string> = Object.fromEntries(
  PICKER_SEARCH_SCOPES.map((s) => [s.value, s.label]),
);

const MULTI_PREFIX: Partial<Record<MultiField, string>> = {
  type:  'Type',
  bloom: 'Bloom',
  tag:   'Tag',
};

export function describeActiveQuizFilters(
  f: QuizPickerFilters,
): QuizFilterChip[] {
  const chips: QuizFilterChip[] = [];
  for (const k of MULTI_FIELDS) {
    for (const v of f[k]) {
      const prefix = MULTI_PREFIX[k];
      chips.push({ field: k, value: v, label: prefix ? `${prefix}: ${v}` : v });
    }
  }
  if (f.q) {
    const where = (f.qf.length ? f.qf : [DEFAULT_SCOPE])
      .map((s) => SCOPE_LABEL[s] ?? s)
      .join(', ');
    chips.push({ field: 'q', label: `“${f.q}” in ${where}` });
  }
  return chips;
}

// ── Apply filters to a Supabase query ─────────────────────────────
// The hard scope (is_published / parent_case_id / trend_id) is applied
// by the caller (getPickerQuestions); this only layers the facets +
// scoped search on top.
interface FilterableQuery<Q> {
  in:       (column: string, values: string[]) => Q;
  ilike:    (column: string, value: string) => Q;
  overlaps: (column: string, value: string[]) => Q;
  or:       (filters: string) => Q;
}

export function applyQuizPickerFilters<Q extends FilterableQuery<Q>>(
  query: Q,
  f: QuizPickerFilters,
): Q {
  let q = query;
  for (const k of Object.keys(COLUMN_OF) as MultiField[]) {
    const values = f[k];
    if (values.length) q = q.in(COLUMN_OF[k]!, values);
  }
  if (f.tag.length) q = q.overlaps('tags', f.tag);
  if (f.q) {
    const scopes = f.qf.length ? f.qf : [DEFAULT_SCOPE];
    const cols = scopes
      .map((s) => PICKER_SEARCH_SCOPES.find((x) => x.value === s)?.column as string | undefined)
      .filter((c): c is string => Boolean(c));
    if (cols.length <= 1) {
      q = q.ilike(cols[0] ?? 'stem', `%${f.q}%`);
    } else {
      const safe = f.q.replace(/[,()"]/g, ' ').trim();
      if (safe) q = q.or(cols.map((c) => `${c}.ilike.*${safe}*`).join(','));
    }
  }
  return q;
}
