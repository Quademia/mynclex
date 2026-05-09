// mynclex/lib/bank/runner/types.ts
//
// Runner-internal type shapes. These are what the runner reads from the
// 5 snapshot tables (attempts, items, case_snapshots, trend_snapshots,
// answers) and what the client component receives from page.tsx.
//
// Pillar 2 (no answer-key leakage) is enforced by the type split:
//   • SealedItem omits correct_answer_snapshot_json + rationale columns.
//   • UnsealedItem extends SealedItem with the keys + rationale.
// Live mode renders SealedItem only; review mode renders UnsealedItem;
// per-Q submit (UL hybrid, runner.html §2.3.1) returns one UnsealedItem
// projection via the Server Action — never a wholesale unseal.

import type { QuestionType, CjmmStep } from '@/lib/bank/classifications';
import type { BankItemCorrect } from '@/lib/bank/types';
import type { BankItemAnswer } from '@/lib/scoring';

export type RunnerMode = 'live' | 'review';

export type SubmissionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'AUTO_SUBMITTED'
  | 'SKIPPED';

export interface AttemptHeader {
  attempt_id:               string;
  student_id:               string;
  source:                   'CUSTOM_BUILT' | 'READINESS_PACK' | 'PROGRAMME_ASSIGNED';
  intent:                   'STUDY' | 'EXAM';
  mode:                     'UNTIMED_LEARNING' | 'UNTIMED_TEST' | 'TIMED_FREE_NAV' | 'TIMED_SEQUENTIAL' | 'CAT';
  status:                   'IN_PROGRESS' | 'COMPLETED' | 'TIMED_OUT' | 'ABANDONED';
  duration_seconds:         number | null;
  filters_json:             Record<string, unknown>;
  requested_question_count: number;
  actual_question_count:    number;
  actual_unit_count:        number;
  final_score:              number | null;
  created_at:               string;
  started_at:               string | null;
  ended_at:                 string | null;
  last_activity_at:         string;
}

export interface SealedItem {
  attempt_item_id:         string;
  position:                number;
  question_type:           QuestionType;
  stem_snapshot:           string;
  instruction_snapshot:    string | null;
  marks_snapshot:          number;
  classification_snapshot: Record<string, unknown>;
  content_snapshot_json:   Record<string, unknown>;
  parent_case_id:          string | null;
  case_position:           number | null;
  cjmm_step:               CjmmStep | null;
  trend_id:                string | null;
  shuffle_seed:            number | null;
  option_order_json:       Record<string, unknown>;
}

export interface UnsealedItem extends SealedItem {
  correct_answer_snapshot_json: BankItemCorrect;
  rationale_snapshot:           string | null;
  rationale_img_snapshot:       string | null;
}

export interface AnswerRow {
  attempt_item_id:   string;
  answer_json:       BankItemAnswer | null;
  submission_status: SubmissionStatus;
  is_correct:        boolean | null;
  score_awarded:     number | null;
  time_spent_sec:    number | null;
  submitted_at:      string | null;
}

export interface CaseSnapshot {
  case_id:                   string;
  title_snapshot:            string;
  scenario_summary_snapshot: string | null;
  tabs_snapshot_json:        unknown[];
}

export interface TrendSnapshot {
  trend_id:                 string;
  title_snapshot:           string;
  scenario_snapshot:        string | null;
  kind_snapshot:            string;
  row_label_snapshot:       string | null;
  timepoints_snapshot_json: unknown[];
  rows_snapshot_json:       unknown[];
}

export type CellFill = 'unanswered' | 'answered' | 'right' | 'wrong' | 'skipped';

// The bundle page.tsx hands to the client. Discriminated by `mode`:
// live carries SealedItem[]; review carries UnsealedItem[]. Type
// narrowing on `data.mode` propagates the right item shape downstream.
export interface LiveData {
  mode:    'live';
  attempt: AttemptHeader;
  items:   SealedItem[];
  cases:   CaseSnapshot[];
  trends:  TrendSnapshot[];
  answers: AnswerRow[];
}
export interface ReviewData {
  mode:    'review';
  attempt: AttemptHeader;
  items:   UnsealedItem[];
  cases:   CaseSnapshot[];
  trends:  TrendSnapshot[];
  answers: AnswerRow[];
}
export type RunnerData = LiveData | ReviewData;

// What submitAnswerAction returns to the client — the per-Q unseal,
// scoped to one item only (runner.html §2.3.1). Other items stay sealed.
export interface SubmitAnswerResult {
  attempt_item_id:              string;
  score_awarded:                number;
  is_correct:                   boolean;
  marks_max:                    number;
  correct_answer_snapshot_json: BankItemCorrect;
  rationale_snapshot:           string | null;
  rationale_img_snapshot:       string | null;
}
