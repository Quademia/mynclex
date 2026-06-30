// mynclex/lib/scoring/types.ts
//
// Student-answer wire shapes and the scoring result shape.
//
// Each *Answer mirrors the matching *Correct interface in lib/bank/types.ts
// but holds the student's picks instead of the curator's rubric. Where a
// student can skip a sub-part (a row, a blank, a slot, the centre wing),
// the type allows null or a missing key — scoring treats those as 0 for
// that element.
//
// These types are the runner-↔-scoring contract. The runner converts its
// internal state into one of these shapes and hands it to scoreAttempt.

export type McqAnswer = string | null;
export type TfAnswer = string | null;
export type SataAnswer = string[];
export type SelectNAnswer = string[];
export type HighlightAnswer = string[];

// rowId -> columnId; missing rows = skipped (score 0 for that row)
export type MatrixAnswer = Record<string, string>;

// blankId -> choiceId; missing blanks = skipped
export type ClozeAnswer = Record<string, string>;

// slotId -> tokenId; missing slots = skipped
export type DragDropAnswer = Record<string, string>;

// DRAG_CLOZE — same wire shape as DragDropAnswer (slotId -> tokenId); a
// separate name so the new type is self-contained as DRAG_DROP is retired.
export type DragClozeAnswer = Record<string, string>;

// Each wing array holds the student's picks for that wing. centre is one
// pick or null. UI constraints (2 / 1 / 2) mean wings shouldn't exceed
// these counts at submission time, but the scoring math is defensive
// regardless — see dispatch.ts.
export interface BowtieAnswer {
  left: string[];
  centre: string | null;
  right: string[];
}

// Union of every per-type answer shape. Order matches the QuestionType
// classification list. TfAnswer/SelectNAnswer are structurally identical
// to McqAnswer/SataAnswer respectively (TS dedupes them in the union),
// but they're listed by name so a reader can see all 9 types accounted
// for at a glance.
export type BankItemAnswer =
  | McqAnswer
  | TfAnswer
  | SataAnswer
  | SelectNAnswer
  | MatrixAnswer
  | HighlightAnswer
  | ClozeAnswer
  | DragDropAnswer
  | DragClozeAnswer
  | BowtieAnswer;

// The result every scoring path produces.
//   score_awarded: 0..max for the question
//   is_correct: full-credit-only verdict — true only when score_awarded === max
//               AND no penalising wrong picks (per bank-marks-and-scoring §5.5).
export interface ScoreResult {
  score_awarded: number;
  is_correct: boolean;
}
