// mynclex/lib/scoring/index.ts
//
// Public barrel for the scoring module. Call sites should import from
// '@/lib/scoring', not from the internal files.

export {
  scoreAllOrNothing,
  scorePlusMinus,
  scorePerRow,
  scorePerRowMulti,
  scorePerBlank,
  scorePerSlot,
} from './functions';

export { computeMarksFromKey, scoreAttempt } from './dispatch';

// The three-state DISPLAY verdict. Derived from score + marks, never
// stored — see verdict.ts for why `is_correct` was left alone.
export { verdictFor, VERDICT_LABEL } from './verdict';
export type { Verdict } from './verdict';

export type {
  McqAnswer,
  TfAnswer,
  SataAnswer,
  SelectNAnswer,
  HighlightAnswer,
  MatrixAnswer,
  MatrixMrAnswer,
  ClozeAnswer,
  DragClozeAnswer,
  DragOrderAnswer,
  BowtieAnswer,
  BankItemAnswer,
  ScoreResult,
} from './types';
