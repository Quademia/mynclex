// mynclex/lib/bank/packs/types.ts
//
// Readiness packs — curator-side types (Slice ②a).
// Storage: nclex_readiness_packs + nclex_readiness_pack_items (link
// rows, one per member question; wrapper members are per-child rows at
// consecutive positions — readiness-packs.md §6).
//
// `position` is a SPACED ordinal (the "store" model, STEP = 1e6 — the
// cohort-activities pattern): order is ascending position, the printed
// "position 12" is the dense 1-based index computed at render. Moves
// write midpoints into gaps, so the UNIQUE (pack_id, position)
// constraint never sees a collision and nothing renumbers globally.

export const PACK_POSITION_STEP = 1_000_000;

export interface PackRow {
  pack_id:        string;
  title:          string;
  description:    string | null;
  n:              number | null;
  time_limit_sec: number | null;
  published:      boolean;
  status:         'draft' | 'active' | 'archived';
}

/** One pack in the strip / list — pack row + live member count. */
export interface PackOverview extends PackRow {
  /** Pack number for the pill label ("Pack 3") — derived from id order. */
  num:   number;
  count: number;
}

/** A member question row, joined to its bank item. */
export interface PackMember {
  linkId:   string;
  itemId:   string;
  position: number;             // spaced ordinal (storage), NOT the printed number
  questionType: string;
  stemLabel:    string;         // plain-text preview ("(image)" fallback)
  difficulty:   string | null;
  category:     string | null;  // client_needs_category
  subcategory:  string | null;  // client_needs_subcategory (blueprint meter — ③)
  isPublished:  boolean;
  parentCaseId: string | null;
  trendId:      string | null;
  cjmmStep:     string | null;  // case children only
}

/** A run of consecutive members belonging to one case / trend, or a standalone. */
export type PackUnit =
  | { kind: 'q'; member: PackMember }
  | {
      kind: 'case' | 'trend';
      wrapperId:    string;
      title:        string;
      isPublished:  boolean;
      members:      PackMember[];
    };

export interface PackDetail {
  pack:  PackRow;
  units: PackUnit[];
  /** Total member questions (per-child count, = link-row count). */
  count: number;
}

export interface PackActionResult {
  ok:     boolean;
  error?: string;
}

// ── Picker (Slice ②b) ────────────────────────────────────────────────
// Candidate shapes the slide-over filters CLIENT-SIDE (prototype
// parity — search + facets over a one-shot load). `inPack` carries the
// double-add badge: 'Pack N' (another pack, disabled) or 'this pack'
// (trend siblings already placed here); standalones/cases already in
// THIS pack are excluded server-side (they're on the members list).

export interface PickerQuestion {
  itemId:       string;
  stemLabel:    string;
  questionType: string;
  difficulty:   string | null;
  category:     string | null;   // client_needs_category (top level, 4)
  subcategory:  string | null;   // client_needs_subcategory (8)
  subject:      string | null;   // nursing_subject
  bodySystem:   string | null;
  bloom:        string | null;   // bloom_level
  tags:         string[];        // curator tags (free-form; facet opts derived from the pool)
  inPack:       string | null;
}

export interface PickerCase {
  caseId:       string;
  title:        string;
  childCount:   number;
  childTypes:   string[];
  childSubcats: string[];        // for the ANY-child facet match
  childSystems: string[];
  inPack:       string | null;
}

export interface PickerTrendChild {
  itemId:       string;
  stemLabel:    string;
  questionType: string;
  difficulty:   string | null;
  subcategory:  string | null;
  bodySystem:   string | null;
  inPack:       string | null;
}

export interface PickerTrend {
  trendId:  string;
  title:    string;
  children: PickerTrendChild[];  // per-question selection — §5 revision
}

export interface PackPickerData {
  target:      number;
  remaining:   number;
  standalones: PickerQuestion[];
  cases:       PickerCase[];
  trends:      PickerTrend[];
}

export type PickerLoadResult =
  | { ok: true; data: PackPickerData }
  | { ok: false; error: string };

// ── Reserved-stock lens (Slice ③) ────────────────────────────────────
// One row per reserved QUESTION. Reserved = carries the `readiness`
// tag itself, sits inside a readiness-tagged case (wrapper tags
// inherit — the eligibility-arc rule), or is a pack member. For case
// children the builder-visibility shown is the CASE row's flag (the
// per-entity rule — the child's own flag is a no-op there).

export interface ReservedRow {
  itemId:           string;
  questionType:     string;
  stemLabel:        string;
  difficulty:       string | null;
  subcategory:      string | null;
  isPublished:      boolean;
  /** The flag that actually controls builder exposure for this row. */
  isBuilderVisible: boolean;
  source:           'standalone' | 'case' | 'trend';
  wrapperId:        string | null;
  /** Pack number holding this question, or null = unassigned. */
  packNum:          number | null;
}

export interface ReservedStock {
  rows:    ReservedRow[];
  /** Sum of the packs' n — the "how far to 500" denominator. */
  target:  number;
  packNums: number[];
}
