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
  /** Engagement clock (STUDY, TIMED_FREE_NAV only): engaged seconds spent so
   *  far. remaining = duration_seconds - engaged_seconds_used. NULL for every
   *  other mode and for a fresh engagement attempt before its first save —
   *  both read as 0. See migration 20260815120000. */
  engaged_seconds_used:     number | null;
  filters_json:             Record<string, unknown>;
  requested_question_count: number;
  actual_question_count:    number;
  actual_unit_count:        number;
  final_score:              number | null;
  /** Pass threshold this attempt is graded against (0..1 fraction).
   *  Tutor-Quiz slice 3: populated by `nclex_create_programme_attempt`
   *  from the quiz's pass_score. Bank attempts leave it null today
   *  (Builder + future Readiness Packs may populate it later).
   *  Drives the review-mode "· Pass" / "· Fail" suffix on the
   *  score pill. NULL = ungraded (pill shows only "Score · NN%"). */
  pass_score:               number | null;
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
  // Frozen chart tabs (Slice 3b). The trend stimulus is entirely
  // tab-based since Slice 4 retired the flat grid.
  tabs_snapshot_json:       unknown[];
}

export type CellFill = 'unanswered' | 'answered' | 'right' | 'wrong' | 'skipped';

// Per-item unseal envelope. Live mode receives this via two paths:
//   (a) submitAnswerAction's response on per-Q submit (UL hybrid,
//       runner.html §2.3.1) — written into clientUnseal at submit time.
//   (b) page.tsx's `seededUnseal` map for items whose answer row is
//       already finalised at page load (resume) — seeds clientUnseal
//       on mount so UL students see per-Q feedback persist across
//       reloads. Pillar 2 holds: only items the student has already
//       submitted get unsealed; not-yet-answered items stay sealed.
// Review mode reads the same data straight off UnsealedItem instead.
export interface PerItemUnseal {
  correct:      BankItemCorrect;
  rationale:    string | null;
  rationaleImg: string | null;
  marksMax:     number;
}

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
  /** Unseal envelopes for items whose answer row is already finalised
   *  (SUBMITTED / AUTO_SUBMITTED / SKIPPED) at page load. Seeds
   *  clientUnseal on mount so UL resume restores per-Q feedback.
   *  Empty {} when no finalised rows exist (fresh attempt). */
  seededUnseal: Record<string, PerItemUnseal>;
  /** Slice 3a — destination for the topbar's ← Exit button. Resolved
   *  server-side per attempt source (bank → practice, programme →
   *  curriculum URL via cohort lookup, etc.) so the click is a sync
   *  router.push with no spinner. Same resolver feeds the results
   *  popup's Exit button. */
  exitHref: string;
}
export interface ReviewData {
  mode:    'review';
  attempt: AttemptHeader;
  items:   UnsealedItem[];
  cases:   CaseSnapshot[];
  trends:  TrendSnapshot[];
  answers: AnswerRow[];
  /** Slice 3a — see LiveData.exitHref. */
  exitHref: string;
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
