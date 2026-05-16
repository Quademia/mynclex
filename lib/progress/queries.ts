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
import type { ActivityProgressMap, ActivityProgressRow } from './types';

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
