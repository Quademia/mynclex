// mynclex/lib/progress/queries.ts
//
// Progress engine — Slice 1. Read-side helpers.
//
// Per the spec (docs/product-plan/progress-engine.md §6.1), the
// canonical curriculum-side read is "for a list of activity ids,
// give me the student's progress row when one exists." Caller
// scopes by activity id list (already filtered to a programme /
// cohort by the calling query); the student_own RLS policy scopes
// to the caller's own rows automatically.

import { createClient } from '@/lib/supabase/server';
import type {
  ActivityProgressMap,
  ActivityProgressRow,
  InProgressQuizMap,
} from './types';

/**
 * Fetch progress rows for the given activity ids, returned as a
 * Map keyed by activity_id. Empty input → empty map (no DB call).
 *
 * Student scoping is enforced by the
 * nclex_student_activity_progress_student_own RLS policy — the
 * SELECT only returns rows where student_id = auth.uid(). No
 * studentId argument is needed (and adding one would invite
 * caller-side mistakes that bypass the RLS check anyway).
 *
 * Returns an empty map on error rather than throwing — progress is
 * a soft signal (the curriculum still renders without ticks if
 * this query fails). Hard errors here would block the entire
 * curriculum page.
 */
export async function getActivityProgressMap(
  activityIds: string[]
): Promise<ActivityProgressMap> {
  if (activityIds.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_student_activity_progress')
    .select('activity_id, completion_source, completed_at, attempt_id')
    .in('activity_id', activityIds);

  if (error || !data) return new Map();

  const map: ActivityProgressMap = new Map();
  for (const row of data as ActivityProgressRow[]) {
    map.set(row.activity_id, row);
  }
  return map;
}

/**
 * Fetch IN_PROGRESS programme attempts for the caller, returned as
 * a Map keyed by `programme_activity_id`. The mapped value is the
 * attempt's `last_activity_at` (used to pick the most-recent for
 * the "Where I left off" finder; also a free signal for any
 * other consumer that wants recency).
 *
 * RLS scopes to the caller's own attempts; this helper takes no
 * arguments. Returns an empty map on error rather than throwing —
 * progress signals are soft (the curriculum still renders without
 * them if this query fails). Per the spec (progress-engine.md §1),
 * IN_PROGRESS state for quiz types is DERIVED at read time, not
 * stored — this is that derivation.
 *
 * Activity_id values come from the legacy TEXT column on
 * nclex_attempts (forward-reference per the schema comment). We
 * return them as strings; callers compare against the UUID-typed
 * activity_id from nclex_programme_activities.
 */
export async function getInProgressQuizAttempts(): Promise<InProgressQuizMap> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_attempts')
    .select('programme_activity_id, last_activity_at')
    .eq('source', 'PROGRAMME_ASSIGNED')
    .eq('status', 'IN_PROGRESS')
    .not('programme_activity_id', 'is', null);

  if (error || !data) return new Map();

  // If a student has multiple IN_PROGRESS attempts for the same
  // activity (edge case — Slice 3 of tutor-quiz scopes resume to
  // one in-progress per activity, but defending here is cheap),
  // keep the most recently active one.
  const map: InProgressQuizMap = new Map();
  for (const row of data as Array<{
    programme_activity_id: string | null;
    last_activity_at: string;
  }>) {
    if (!row.programme_activity_id) continue;
    const existing = map.get(row.programme_activity_id);
    if (!existing || existing < row.last_activity_at) {
      map.set(row.programme_activity_id, row.last_activity_at);
    }
  }
  return map;
}
