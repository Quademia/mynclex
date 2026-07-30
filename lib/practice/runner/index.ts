// mynclex/lib/bank/runner/index.ts
//
// Barrel for the runner module. Call sites import from '@/lib/practice/runner'.

export type {
  RunnerMode,
  SubmissionStatus,
  AttemptHeader,
  SealedItem,
  UnsealedItem,
  AnswerRow,
  CaseSnapshot,
  TrendSnapshot,
  CellFill,
  LiveData,
  ReviewData,
  RunnerData,
  PerItemUnseal,
  SubmitAnswerResult,
} from './types';

export {
  deriveCellFill,
  FILL_LABEL,
  isVisibleUnderFilter,
} from './cell-state';

export type {
  GridFilter,
} from './cell-state';

export { McqRunner,       isMcqComplete }       from './types/mcq';
export { TfRunner,        isTfComplete }        from './types/tf';
export { SataRunner,      isSataComplete }      from './types/sata';
export { SelectNRunner,   isSelectNComplete }   from './types/select-n';
export { MatrixRunner,    isMatrixComplete }    from './types/matrix';
export { MatrixMrRunner,  isMatrixMrComplete }  from './types/matrix-mr';
export { HighlightRunner, isHighlightComplete } from './types/highlight';
export { ClozeRunner,     isClozeComplete }     from './types/cloze';
export { DragClozeRunner, isDragClozeComplete } from './types/drag-cloze';
export { DragOrderRunner, isDragOrderComplete } from './types/drag-order';
export { BowtieRunner,    isBowtieComplete }    from './types/bowtie';
export { RationaleBlock } from './rationale';
export { ScoringStrip, formatDuration } from './scoring-strip';

// Case-block UX (slice 4.3) — wrapper panel + CJMM stepper for case-childs.
export { CasePanel }     from './case/case-panel';
export { CjmmStrip }     from './case/cjmm-strip';
export { ChartTabBody }  from './case/chart-tab-body';

// Trend question UX (slice 4.4) — dataset panel for trend-linked questions.
export { TrendPanel }    from './trend/trend-panel';
