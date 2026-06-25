// mynclex/lib/library/analytics/types.ts
//
// Shapes for the tutor "Question analytics" surface (slice 11.11c) — a
// readout over nclex_library_embed_answers, grouped Note → Practice
// block → question. Overview (cross-note re-teach signal + notes table)
// + the per-note drill-in. Roster/Readers tabs land in Slice 3.

/** The 4-band "reading lens" tier on a first-attempt-accuracy %. */
export type ReadingTier = 'strong' | 'holding' | 'wobbly' | 'reteach';

/** Sidebar legend labels for the lens — single source of truth. */
export const TIER_LABEL: Record<ReadingTier, string> = {
  strong: 'Strong ≥ 78%',
  holding: 'Holding 60–78%',
  wobbly: 'Wobbly 45–60%',
  reteach: 'Re-teach < 45%',
};

export const TIER_ORDER: ReadingTier[] = [
  'strong',
  'holding',
  'wobbly',
  'reteach',
];

// 4-band thresholds (CD "reading lens"). Pure (no server deps) so both
// the read layer and the view can map a % → tier. Tunable; hardcoded v1.
export function tierOf(pct: number): ReadingTier {
  if (pct >= 78) return 'strong';
  if (pct >= 60) return 'holding';
  if (pct >= 45) return 'wobbly';
  return 'reteach';
}

/** One embedded question, aggregated across every reader who reached it. */
export interface EmbedQuestionStat {
  itemId: string;
  stem: string;
  /** The Practice block it lives in — title, or "Practice N". */
  blockLabel: string;
  noteId: string;
  noteTitle: string;
  /** Distinct readers who answered it at least once. */
  reach: number;
  /** First-attempt-correct %, per reader (0–100). */
  firstAccPct: number;
  /** Attempts beyond each reader's first (a re-practice signal). */
  retries: number;
  tier: ReadingTier;
}

/** One note row in the Overview "Notes with embedded questions" table. */
export interface EmbedNoteRow {
  noteId: string;
  title: string;
  blockCount: number;
  questionCount: number;
  reach: number;
  /** null = no reader has reached this note's questions yet. */
  firstAccPct: number | null;
  weakestBlockLabel: string | null;
  weakestBlockPct: number | null;
  tier: ReadingTier | null;
}

/** One KPI card in the Overview strip. */
export interface EmbedAnalyticsKpi {
  label: string;
  value: string;
  sub: string;
  /** Colours the value; omit / 'neutral' = plain ink. */
  tone?: ReadingTier | 'neutral';
}

// ── Scope switcher (Slice 3c) ────────────────────────────────────────

/** One option in the scope switcher — 'all' | a cohort id | 'self'. */
export interface ScopeOption {
  key: string;
  label: string;
}

export interface EmbedScopeMeta {
  options: ScopeOption[];
  activeKey: string;
}

export interface EmbedAnalyticsOverview {
  kpis: EmbedAnalyticsKpi[];
  /** Most-missed questions first, capped — the re-teach targets. */
  reteach: EmbedQuestionStat[];
  notes: EmbedNoteRow[];
  /** False when no reader has answered any embedded question yet. */
  hasAnyData: boolean;
  /** False when the tutor has no embedded-questions blocks at all. */
  hasAnyBlocks: boolean;
  scope: EmbedScopeMeta;
}

// ── Per-note drill-in (Slice 2) ──────────────────────────────────────

/** The tabs on the per-note drill-in. Roster/Readers land in Slice 3. */
export type EmbedNoteTab = 'questions' | 'roster' | 'readers';

/** One option in a question's first-attempt answer distribution. */
export interface OptionDist {
  letter: string; // 'A', 'B', …
  text: string;
  /** % of readers who selected it on their FIRST attempt (0–100). */
  pct: number;
  isKey: boolean; // a correct option
  isTrap: boolean; // the top wrong option, picked by ≥ 20% of readers
}

export interface EmbedQuestionDetail {
  itemId: string;
  /** 1-based position within its block. */
  n: number;
  questionType: string;
  typeLabel: string;
  stem: string;
  reach: number; // readers who answered
  retriedN: number; // readers who re-practised (≥ 2 attempts)
  /** True when nobody has answered it. */
  noData: boolean;
  /** True when only 1–2 readers — a % would be noise. */
  thin: boolean;
  firstAccPct: number;
  latestAccPct: number; // after re-practice
  liftPts: number; // latest − first
  tier: ReadingTier | null;
  options: OptionDist[];
  distNote: string;
}

export interface EmbedBlockDetail {
  blockId: string;
  /** 0-based reading order → "Block N". */
  index: number;
  /** Tutor title, or "Practice N". */
  title: string;
  reach: number;
  /** Total first-attempt answer pairs in the block (the summary count). */
  answers: number;
  questionCount: number;
  firstAccPct: number | null;
  tier: ReadingTier | null;
  questions: EmbedQuestionDetail[];
}

export interface EmbedNoteAnalytics {
  noteId: string;
  noteTitle: string;
  reach: number;
  firstAccPct: number | null;
  blockCount: number;
  questionCount: number;
  blocks: EmbedBlockDetail[];
  /** False when no reader has answered any of this note's questions. */
  hasAnyData: boolean;
  scope: EmbedScopeMeta;
}

// ── Roster + Readers tabs (Slice 3a) ─────────────────────────────────

/** Fields every per-note view shares (header + tab chrome). */
export interface EmbedNoteHeader {
  noteId: string;
  noteTitle: string;
  reach: number;
  firstAccPct: number | null;
  blockCount: number;
  questionCount: number;
  hasAnyData: boolean;
  scope: EmbedScopeMeta;
}

/** One cell in the roster heatmap — a reader's first-try % on one block. */
export interface EmbedReaderCell {
  /** null = the reader hasn't answered anything in this block. */
  pct: number | null;
  tier: ReadingTier | null;
}

export interface EmbedRosterRow {
  studentId: string;
  name: string;
  cells: EmbedReaderCell[];
  overallPct: number | null;
  tier: ReadingTier | null;
}

/** Readers grouped by cohort / self-paced for the roster. */
export interface EmbedRosterGroup {
  key: string;
  label: string;
  count: number;
  /** A colour token for the group dot: 'cohort' | 'self'. */
  kind: 'cohort' | 'self';
  rows: EmbedRosterRow[];
}

/** One row in the Readers list. */
export interface EmbedReaderRow {
  studentId: string;
  name: string;
  initials: string;
  segmentLabel: string;
  isCohort: boolean;
  blocksReached: number;
  totalBlocks: number;
  overallPct: number | null;
  tier: ReadingTier | null;
  retriedLabel: string;
}

export interface EmbedNoteReaders extends EmbedNoteHeader {
  /** Block columns for the roster heatmap header. */
  cols: Array<{ label: string; title: string }>;
  groups: EmbedRosterGroup[];
  readers: EmbedReaderRow[];
}

// ── Per-reader report (Slice 3b) ─────────────────────────────────────

export interface ReportOption {
  letter: string;
  text: string;
  isKey: boolean;
  /** True when this reader selected it on their first attempt. */
  isYou: boolean;
}

export interface ReportQuestion {
  itemId: string;
  stem: string;
  answered: boolean;
  /** '○' not reached · '✓' first-try correct · '✕' missed first. */
  mark: string;
  edgeTone: 'na' | 'ok' | 'bad';
  options: ReportOption[];
  note: string;
}

export interface ReportBlock {
  tag: string; // "Block N"
  title: string;
  questions: ReportQuestion[];
}

export interface EmbedReaderReport {
  noteId: string;
  noteTitle: string;
  studentId: string;
  name: string;
  initials: string;
  segmentLabel: string;
  isCohort: boolean;
  /** "corr / tot" over answered questions. */
  firstScoreLabel: string;
  firstTier: ReadingTier | null;
  latestAccPct: number | null;
  blocks: ReportBlock[];
  /** Which tab to return to. */
  fromTab: EmbedNoteTab;
}
