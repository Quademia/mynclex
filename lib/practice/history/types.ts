// mynclex/lib/practice/history/types.ts
//
// One row of the History table — every attempt the signed-in student
// has made, regardless of status. Distinct from the launchers' shapes
// (ResumableAttempt / RecentAttempt): History lists everything, while
// the launchers cherry-pick a single banner row or a top-3 chip set.

import type { FilterPayload } from '@/lib/practice/builder/types';

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
}
