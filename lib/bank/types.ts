// mynclex/lib/bank/types.ts
//
// Shared TypeScript types for the Bank.
//
// The two JSONB columns on nclex_bank_items (content, correct) are
// polymorphic — their shape varies by question_type. These interfaces
// document the shapes and let the editor + future renderer + scoring
// functions speak the same language.
//
// Family A only for Slice 1.2 (MCQ, TF, SATA, SELECT_N).
// Family B types (MATRIX, HIGHLIGHT, CLOZE, DRAG_DROP, BOWTIE) get
// added here as their respective slices land.

// ─────────────────────────────────────────────────────────────
// Common — every option carries an ID (A–F) + display text.
// Per-option feedback lives in `correct.feedback`, not on the option,
// so the browser never receives feedback before the student submits.
// ─────────────────────────────────────────────────────────────

export interface BankOption {
  id: string;          // 'A', 'B', 'C', ...
  text: string;
}

// ─────────────────────────────────────────────────────────────
// MCQ — pick one correct from N options.
// ─────────────────────────────────────────────────────────────

export interface McqContent {
  options: BankOption[];
}

export interface McqCorrect {
  answer: string;                              // single option ID
  feedback: Record<string, string>;            // keyed by option ID
}

// ─────────────────────────────────────────────────────────────
// TF — locked 2 options ('True' / 'False'), pick one.
// Same shape as MCQ; keeping a separate alias for clarity at call sites.
// ─────────────────────────────────────────────────────────────

export type TfContent = McqContent;
export type TfCorrect = McqCorrect;

// ─────────────────────────────────────────────────────────────
// SATA — pick all that apply.
// ─────────────────────────────────────────────────────────────

export interface SataContent {
  options: BankOption[];
}

export interface SataCorrect {
  answers: string[];                           // one or more option IDs
  feedback: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────
// SELECT_N — pick exactly N. N is set by the curator.
// ─────────────────────────────────────────────────────────────

export interface SelectNContent {
  options: BankOption[];
  select_count: number;                        // exactly this many to pick
}

export interface SelectNCorrect {
  answers: string[];                           // length must equal select_count
  feedback: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────
// MATRIX — rows × columns grid; each row picks exactly one column.
// row_label is the editable top-left header (e.g. "Finding", "Medication").
// ─────────────────────────────────────────────────────────────

export interface MatrixRow {
  id: string;     // 'r1', 'r2', ...
  text: string;
}

export interface MatrixColumn {
  id: string;     // 'c1', 'c2', ...
  text: string;
}

export interface MatrixContent {
  row_label: string;
  rows: MatrixRow[];
  columns: MatrixColumn[];
}

export interface MatrixCorrect {
  cells: Record<string, string>;              // rowId -> columnId
  feedback: Record<string, string>;           // rowId -> per-row feedback
}

// ─────────────────────────────────────────────────────────────
// BOWTIE — fixed NGN bow-tie: 2 Left + 1 Centre + 2 Right = 5 correct.
// Three self-contained wings, each with its own label, tokens, and
// per-wing correctness rule. Token IDs are globally unique across all
// three wings (prefixed lt/ct/rt) so the flat feedback map just works.
// ─────────────────────────────────────────────────────────────

export interface BowtieToken {
  id: string;       // 'lt1' | 'ct1' | 'rt1' etc.
  text: string;
}

export interface BowtieWing {
  label: string;                 // student-facing column heading
  tokens: BowtieToken[];
}

export interface BowtieContent {
  left:   BowtieWing;
  centre: BowtieWing;
  right:  BowtieWing;
}

export interface BowtieCorrect {
  left:     string[];            // exactly 2 token IDs (from left.tokens)
  centre:   string;              // exactly 1 token ID (from centre.tokens)
  right:    string[];            // exactly 2 token IDs (from right.tokens)
  feedback: Record<string, string>;  // keyed by token ID (any wing)
}

// ─────────────────────────────────────────────────────────────
// Discriminated union — narrow on question_type to get the right shape.
// ─────────────────────────────────────────────────────────────

export type BankItemContent =
  | McqContent
  | TfContent
  | SataContent
  | SelectNContent
  | MatrixContent
  | BowtieContent;

export type BankItemCorrect =
  | McqCorrect
  | TfCorrect
  | SataCorrect
  | SelectNCorrect
  | MatrixCorrect
  | BowtieCorrect;
