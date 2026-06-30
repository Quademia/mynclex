// mynclex/lib/scoring/index.ts
//
// Public barrel for the scoring module. Call sites should import from
// '@/lib/scoring', not from the internal files.

export {
  scoreAllOrNothing,
  scorePlusMinus,
  scorePerRow,
  scorePerBlank,
  scorePerSlot,
} from './functions';

export { computeMarksFromKey, scoreAttempt } from './dispatch';

export type {
  McqAnswer,
  TfAnswer,
  SataAnswer,
  SelectNAnswer,
  HighlightAnswer,
  MatrixAnswer,
  ClozeAnswer,
  DragDropAnswer,
  DragClozeAnswer,
  BowtieAnswer,
  BankItemAnswer,
  ScoreResult,
} from './types';
