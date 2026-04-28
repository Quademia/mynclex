// mynclex/lib/authoring/index.ts
//
// Public barrel for the new authoring system. Pages import from
// '@/lib/authoring' rather than the deep paths so re-shaping the
// internals doesn't break call sites.

export { StandaloneQuestionModal } from './standalone-question-modal';
export type { SupportedQuestionType } from './standalone-question-modal';

export { McqEditor } from './editors/mcq/editor';
export { rowToMcq, emptyMcq } from './editors/mcq/value';
export type { McqValue, McqOption, BankItemRow } from './editors/mcq/value';

export type {
  ClassificationValue,
  HousekeepingValue,
  SystemMeta,
} from './types';
