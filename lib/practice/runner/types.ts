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
  /** The SOURCE question this row snapshotted, and where it came from.
   *  Distinct from attempt_item_id: that identifies this question *in
   *  this sitting*, this identifies the question itself, across every
   *  sitting it has ever appeared in.
   *
   *  ⚠ The two are the keys of the two different features, and mixing
   *  them compiles cleanly (both are strings) while being wrong — see
   *  docs/product-plan/flag-and-bookmark.md §3.8:
   *    • flag      → attempt_item_id (per sitting, starts empty)
   *    • bookmark  → item_id         (per student, arrives pre-set)
   *  Added by the bookmark slice; nothing else reads it yet. */
  item_id:                 string;
  item_source:             'BANK' | 'TUTOR';
  /** Flagged for review DURING this sitting. Rides on the item row, so
   *  the runner needs no extra query to seed its flag set. Never
   *  deleted — it becomes attempt history and stops being *actionable*
   *  at submit, rather than being cleared. */
  is_flagged:              boolean;
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

// 'partial' arrived with the review scoring strip: the grid painted a
// partially-credited answer dark-red "wrong" while the strip beside it
// said "Partial credit", two inches apart on one screen. 28% of
// submitted answers on dev are partial, so this is the common case, not
// an edge one.
export type CellFill =
  | 'unanswered'
  | 'answered'
  | 'right'
  | 'partial'
  | 'wrong'
  | 'skipped';

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
  /** Bookmarks (flag-and-bookmark.md §3). Keyed by ITEM_ID, not
   *  attempt_item_id — a bookmark is (student, question), so a question
   *  met again in a later sitting ARRIVES ALREADY BOOKMARKED. §3.7: this
   *  is a load to perform, not a rule to enforce; without it the control
   *  renders "off" for a bookmarked question and the student's tap hits
   *  the unique index. Contains only this attempt's items, not the
   *  student's whole bookmark set. */
  bookmarkedItemIds: string[];
  /** Whether the bookmark control is offered at all (§3.4). False for
   *  CAT and readiness packs, because reserved stock can never re-enter
   *  the practice pool — the control would promise a re-quiz the
   *  architecture is committed to refusing. */
  canBookmark: boolean;
  /** Runner tutorial Slice 3c — has this student dismissed the pre-exam
   *  walkthrough offer ("Don't show again")? Read server-side only for a
   *  live, not-yet-started attempt (the preflight is the only place it's
   *  used); false/omitted otherwise. Drives whether the offer popup shows
   *  when Start is pressed. */
  offerDismissed?: boolean;
  /** Runner tutorial sandbox (docs/product-plan/runner-tutorial.md).
   *  When true this is the no-writes teaching runner: every server action
   *  is skipped and Submit scores locally against `sandboxKeys`. A real
   *  attempt NEVER sets this — the whole feature creates no attempt row,
   *  so there is nothing to write. Optional so real bundles omit it. */
  sandbox?: true;
  /** Sandbox only — the per-item answer keys the client-side scorer reads
   *  on Submit, keyed by attempt_item_id. Mirrors exactly what
   *  submitAnswerAction returns from the server, so `mergeSubmitResult` is
   *  reused unchanged. Undefined for real attempts. */
  sandboxKeys?: Record<string, PerItemUnseal>;
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
  /** See LiveData. Bookmarking stays editable in review — unlike the
   *  flag, which freezes at submit (§2.4). Review is where a student has
   *  just seen the rationale, which is the moment they know whether they
   *  understood it or guessed. */
  bookmarkedItemIds: string[];
  /** See LiveData. */
  canBookmark: boolean;
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
