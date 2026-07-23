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
  status: AttemptStatus;
  source: AttemptSource;
  /** Pre-resolved label like "Untimed Learning" — looked up at fetch
   *  time so the table doesn't need to import the mode arrays. */
  mode_label: string;
  requested_count: number;
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
