// mynclex/lib/cohorts/queries.ts
//
// Server-side fetches for cohort surfaces (slice 9.2b).
// RLS scopes SELECT to programmes owned by the signed-in tutor
// (parent-ownership subquery — see db/rls.sql nclex_cohorts).

import { createClient } from '@/lib/supabase/server';
import type { CohortListRow } from './types';

/**
 * All cohorts of a programme, newest first. Returns [] if the
 * programme has no cohorts, or if the tutor doesn't own the
 * programme (RLS filters them out).
 */
export async function getCohortsForProgramme(
  programmeId: string
): Promise<CohortListRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_cohorts')
    .select(
      `cohort_id, programme_id, name, start_date, end_date,
       cohort_size, allow_late_join, cancelled_at,
       created_at, updated_at`
    )
    .eq('programme_id', programmeId)
    .order('start_date', { ascending: false });

  if (error || !data) return [];
  return data as CohortListRow[];
}

/**
 * Lightweight rollup — does this programme have any cohorts?
 * Used by entry-point nudges (programme card / overview) so they
 * don't have to fetch the full cohort list just to decide what to
 * render.
 *
 * Returns 0 when the programme doesn't exist or is hidden by RLS;
 * that's fine for the call sites — they're working off a programme
 * row the tutor already sees, so zero means "really has none."
 */
export async function getCohortCountForProgramme(
  programmeId: string
): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('nclex_cohorts')
    .select('cohort_id', { count: 'exact', head: true })
    .eq('programme_id', programmeId);

  if (error || count == null) return 0;
  return count;
}
