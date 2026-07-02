// mynclex/lib/bank/types.ts
//
// Shared TypeScript types for the Bank.
//
// The two JSONB columns on nclex_bank_items (content, correct) are
// polymorphic — their shape varies by question_type. These interfaces
// document the shapes and let the editor + future renderer + scoring
// functions speak the same language.

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
// MATRIX_MR — Matrix Multiple Response. Same rows × columns grid as
// MATRIX, but each row may have ONE OR MORE correct columns (checkbox
// per cell), scored SATA-style per row. Own self-contained type — it
// reuses MatrixRow/MatrixColumn (shared geometry) but its `correct.cells`
// maps a rowId to an ARRAY of columnIds.
// ─────────────────────────────────────────────────────────────

export interface MatrixMrContent {
  row_label: string;
  rows: MatrixRow[];
  columns: MatrixColumn[];
}

export interface MatrixMrCorrect {
  cells: Record<string, string[]>;            // rowId -> columnId[] (>= 1 each)
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
// CLOZE — sentence with inline {N} markers, one dropdown per blank.
// The stem (on nclex_bank_items.stem) holds the sentence including
// the markers. content.blanks lists choices for each blank. Blank
// IDs (b1, b2, ...) are stable across reorders; choice IDs (c1, c2)
// restart per blank — the nested feedback map disambiguates by
// nesting under the blank ID.
// Markers are silently renumbered on save: gaps like "{1} {3}" are
// rewritten as "{1} {2}" and blank IDs are remapped to match.
// ─────────────────────────────────────────────────────────────

export interface ClozeChoice {
  id: string;      // 'c1', 'c2', ... (restarts per blank)
  text: string;
}

export interface ClozeBlank {
  id: string;      // 'b1', 'b2', ... (stable across reorders)
  choices: ClozeChoice[];
}

export interface ClozeContent {
  blanks: ClozeBlank[];
}

export interface ClozeCorrect {
  answers:  Record<string, string>;                   // blankId -> correct choiceId
  feedback: Record<string, Record<string, string>>;   // blankId -> choiceId -> text
}

// ─────────────────────────────────────────────────────────────
// HIGHLIGHT — passage with [[bracketed]] clickable chunks.
// The stem (on nclex_bank_items.stem) holds the passage with the
// double brackets intact — single brackets `[anything]` are literal
// passage text (medical notation like `[K⁺] = 3.2` is safe).
// content.chunks lists one entry per bracketed span, in passage order.
// Chunk IDs (h1, h2, ...) are stable positional. correct_ids is a
// flat list; feedback is flat (unlike Cloze, which nests per-blank).
// ─────────────────────────────────────────────────────────────

export interface HighlightChunk {
  id: string;       // 'h1', 'h2', ... (stable positional)
  text: string;     // the text between [[ and ]]
}

export interface HighlightContent {
  chunks: HighlightChunk[];
}

export interface HighlightCorrect {
  correct_ids: string[];              // IDs of chunks marked correct
  feedback: Record<string, string>;   // chunkId -> feedback text
}

// ─────────────────────────────────────────────────────────────
// DRAG_DROP — two subtypes in one shape.
//   ORDERED : student drags tokens to ranked positions (1st, 2nd, ...).
//   SENTENCE: student drags tokens into [N] markers in the stem.
//
// Slots hold position + optional target_text (display hint shown next
// to the slot in the student runner). Tokens are the draggable pool;
// the pool may contain distractors so tokens.length >= slots.length.
// correct.slots is the rubric (slotId → tokenId, 1:1 for active slots).
// feedback is sparse + keyed by TOKEN id — every token (the correct ones
// AND the distractors) can carry its own explanation. A correct token's
// feedback surfaces at its slot in review; a distractor's surfaces in the
// distractor strip. (Moved off slots 2026-06-30 so distractors can be
// explained, like every other type's per-option feedback.)
// ─────────────────────────────────────────────────────────────

export interface DragDropSlot {
  id: string;             // 's1', 's2', ... — for SENTENCE, s1 ↔ [1]
  target_text: string;    // ORDERED: "1st action" | SENTENCE: optional hint
}

export interface DragDropToken {
  id: string;             // 't1', 't2', ...
  text: string;
}

export interface DragDropContent {
  subtype: 'ORDERED' | 'SENTENCE';
  slots: DragDropSlot[];
  tokens: DragDropToken[];
}

export interface DragDropCorrect {
  slots: Record<string, string>;              // slotId -> correct tokenId
  feedback?: Record<string, string>;          // sparse — tokenId -> feedback
}

// ─────────────────────────────────────────────────────────────
// DRAG_CLOZE — the sentence-blanks type split out of DRAG_DROP (2026-06-30).
// The stem carries inline [N] markers; each maps to a slot the student drags
// a token into. Same slot/token/feedback shape as DRAG_DROP's SENTENCE mode,
// minus the `subtype` discriminator (this type is always sentence). Feedback
// is token-keyed (every token — answer or distractor — can be explained).
// ─────────────────────────────────────────────────────────────

export interface DragClozeSlot {
  id: string;             // 's1', 's2', ... — s1 ↔ marker [1]
  target_text: string;    // optional hint shown by the slot in the runner
}

export interface DragClozeToken {
  id: string;             // 't1', 't2', ...
  text: string;
}

export interface DragClozeContent {
  slots: DragClozeSlot[];
  tokens: DragClozeToken[];
}

export interface DragClozeCorrect {
  slots: Record<string, string>;              // slotId -> correct tokenId
  feedback?: Record<string, string>;          // sparse — tokenId -> feedback
}

// ─────────────────────────────────────────────────────────────
// DRAG_ORDER — the ranked-response type split out of DRAG_DROP (2026-06-30).
// The student drags tokens into curator-defined ranked positions (1st, 2nd, …).
// No stem markers — the stem is a plain rich prompt; slots are an ordered list.
// Same slot/token/feedback shape as DRAG_DROP's ORDERED mode, minus the
// `subtype` discriminator. Feedback is token-keyed (every token explainable).
// ─────────────────────────────────────────────────────────────

export interface DragOrderSlot {
  id: string;             // 's1', 's2', ... — render order = rank
  target_text: string;    // position label, e.g. "1st action"
}

export interface DragOrderToken {
  id: string;             // 't1', 't2', ...
  text: string;
}

export interface DragOrderContent {
  slots: DragOrderSlot[];
  tokens: DragOrderToken[];
}

export interface DragOrderCorrect {
  slots: Record<string, string>;              // slotId -> correct tokenId
  feedback?: Record<string, string>;          // sparse — tokenId -> feedback
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
  | MatrixMrContent
  | BowtieContent
  | ClozeContent
  | HighlightContent
  | DragDropContent
  | DragClozeContent
  | DragOrderContent;

export type BankItemCorrect =
  | McqCorrect
  | TfCorrect
  | SataCorrect
  | SelectNCorrect
  | MatrixCorrect
  | MatrixMrCorrect
  | BowtieCorrect
  | ClozeCorrect
  | HighlightCorrect
  | DragDropCorrect
  | DragClozeCorrect
  | DragOrderCorrect;
