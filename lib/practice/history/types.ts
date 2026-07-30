// mynclex/lib/practice/history/types.ts
//
// One row of the History table — every attempt the signed-in student
// has made, regardless of status. Distinct from the launchers' shapes
// (ResumableAttempt / RecentAttempt): History lists everything, while
// the launchers cherry-pick a single banner row or a top-3 chip set.

import type { FilterPayload } from '@/lib/practice/builder/types';
import type { ModeId } from '@/lib/practice/builder/filter-config';

export type AttemptStatus =
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'TIMED_OUT'
  | 'ABANDONED';

export type AttemptSource =
  | 'CUSTOM_BUILT'
  | 'READINESS_PACK'
  | 'PROGRAMME_ASSIGNED';

export interface HistoryAttempt {
  attempt_id: string;
  created_at: string;
  /** When the student last touched it. For an unfinished sitting this is
   *  the useful date — "left off 2 days ago" is what you act on, while
   *  "started 3 weeks ago" isn't. Null on rows old enough to predate the
   *  column being populated. */
  last_activity_at: string | null;
  status: AttemptStatus;
  source: AttemptSource;
  /** Pre-resolved label like "Untimed Learning" — looked up at fetch
   *  time so the table doesn't need to import the mode arrays. */
  mode_label: string;
  requested_count: number;
  /** What the sitting actually contained, which is not always what was
   *  asked for — the pool can come up short. Null on rows never
   *  finalised; callers fall back to requested_count. */
  actual_count: number | null;
  /** Item-equivalent average (0–1). Null while IN_PROGRESS / ABANDONED. */
  final_score: number | null;
  /** Saved filter payload — fed to summariseRecent() for the Session
   *  column so each row reads as e.g. "Pharmacology · Hard · 25 Q". */
  filters_json: FilterPayload;

  // ── CAT ──────────────────────────────────────────────────
  // A CAT is stored as CUSTOM_BUILT with mode 'CAT', so `source`
  // alone can't identify one. These let a consumer render a CAT
  // sitting by its verdict instead of a score — including the
  // timed-out-under-the-minimum case, which must go through
  // isUnmeasured() rather than being re-derived per surface.
  /** Raw mode id — 'CAT' marks an adaptive sitting. */
  mode: ModeId;
  cat_verdict: 'ABOVE_STANDARD' | 'BELOW_STANDARD' | null;
  cat_termination_reason: string | null;
  cat_items_administered: number | null;
}

/** How much of a sitting was actually attempted, plus the time it took.
 *  Read from nclex_attempt_answers, so it costs an extra query — the
 *  dashboard rail deliberately goes without. */
export interface AnswerStats {
  /** Questions with a real submission. DRAFT and SKIPPED don't count —
   *  ⚠ merely opening a question writes a DRAFT row, so counting rows
   *  rather than submissions would call every visited question answered. */
  answered: number;
  /** Questions the sitting put in front of the student. */
  served: number;
  /** Summed engaged time, or null when none was recorded. Sittings older
   *  than the time engine legitimately have none, so this renders blank
   *  rather than as zero — a zero would be a lie. */
  engagedSeconds: number | null;
}

// ── The list's own query shape ────────────────────────────────
// Filters and paging live in the URL (?type=cat&page=2), so the back
// button works, a filtered view can be bookmarked, and the whole list
// can render on the server with no client state.

export type HistoryTypeFilter = 'all' | 'practice' | 'pack' | 'cat';

export type HistoryStateFilter = 'all' | 'open' | 'done' | 'discarded';

export interface HistoryQuery {
  type: HistoryTypeFilter;
  state: HistoryStateFilter;
  /** Free text matched against the sitting's saved subjects. */
  q: string;
  /** 1-based. */
  page: number;
}

export interface HistoryRow {
  attempt: HistoryAttempt;
  /** Null when the sitting has no answer rows at all. */
  stats: AnswerStats | null;
  /**
   * Whether a readiness pack's 21-day ANSWER review window is still open.
   * Null for anything that isn't a pack, and for a pack whose credit row
   * can't be found.
   *
   * Only the answers expire — the pack's score and report last forever — so
   * this gates the row's Review action and nothing else.
   */
  packReviewOpen: boolean | null;
}

export interface HistoryPage {
  rows: HistoryRow[];
  /** Total matching the CURRENT filters — the real count from the
   *  database, not the number of rows fetched. The two were conflated
   *  once already: a 50-row query limit was reported as a student's
   *  lifetime total on the dashboard doorway. */
  total: number;
  page: number;
  pageSize: number;
  /** Total ignoring every filter, so an empty filtered view can tell the
   *  difference between "you have no sittings" and "none match this". */
  totalUnfiltered: number;
}
