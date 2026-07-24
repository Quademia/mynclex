// mynclex/lib/bank/entry-helpers/types.ts
//
// Shared shapes for the bank-entry helpers (Resume banner, Recent
// Quizzes shortcut, Weak Spots button). Used by the Builder page
// today; will be reused on the Dashboard and History pages later.

import type { FilterPayload } from '@/lib/practice/builder/types';
import type { Intent, ModeId } from '@/lib/practice/builder/filter-config';

/**
 * The single most-recent unfinished STUDY attempt for the signed-in
 * student. Drives the Resume banner. EXAM-intent attempts can't be
 * resumed (per planning §15), so we never surface them here.
 */
export interface ResumableAttempt {
  attempt_id: string;
  intent: Intent;
  mode: ModeId;
  /** Total questions delivered into the attempt (post-drift selection). */
  total: number;
  /** Number of questions the student has submitted an answer for. */
  done: number;
  /** Last write-touch on the attempt — drives the "from {when}" line. */
  last_activity_at: string;
  /** Display label for the mode, e.g. "Untimed Learning". Resolved
   *  from MODES_STUDY/MODES_EXAM at fetch time so the component
   *  doesn't need to know about the lookup. */
  mode_label: string;
}

/**
 * One row of the Recent Quizzes shortcut (last 3 finished attempts
 * for the student). Carries enough data to summarise as a chip and
 * to repopulate the Builder form on click.
 */
export interface RecentAttempt {
  attempt_id: string;
  created_at: string;
  intent: Intent;
  mode: ModeId;
  requested_count: number;
  /** The original payload sent to nclex_create_attempt — same shape
   *  buildFilterPayload produces. parse-filter-payload.ts inverts it
   *  back into BuilderState when the student clicks a chip. */
  filters_json: FilterPayload;
  /** Pre-rendered display label — e.g. "Pharmacology · Hard · 50 Q".
   *  Built server-side via summarise-recent.ts. */
  summary: string;
  /** "Learning", "Sequential Exams" etc. — resolved at fetch via modeLabelFor(). */
  mode_label: string;
}
