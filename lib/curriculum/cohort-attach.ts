// mynclex/lib/curriculum/cohort-attach.ts
//
// Shared cohort-only plumbing for the library Note + Shelf attach actions
// (cohort-specific activities, Slice 3b). A cohort-only Note/Shelf is an
// attach whose activity row carries cohort_id PLUS a COHORT_ONLY checklist
// row — exactly what createCohortOnlyActivityAction does for the editor
// types, just reached through the attach flow.
//
// Plain module (not 'use server') so both attach actions —
// library-note-actions.ts and shelf-activity-actions.ts — can import these
// non-action helpers (a 'use server' file can only export async Server
// Actions; these take a Supabase client argument).

import type { createClient } from '@/lib/supabase/server';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
const DAY_MS = 86_400_000;

/**
 * For a cohort-only attach, confirm the cohort belongs to the unit's
 * programme and return its start_date (for the week-pacing release
 * default). A null cohortId is the template path — returns ok with an
 * unused start date so callers can treat both uniformly.
 */
export async function resolveCohortForAttach(
  supabase: SupabaseClient,
  cohortId: string | null,
  programmeId: string,
): Promise<{ ok: true; startDate: string } | { ok: false; error: string }> {
  if (cohortId === null) return { ok: true, startDate: '' };
  const { data: cohort } = await supabase
    .from('nclex_cohorts')
    .select('cohort_id, programme_id, start_date')
    .eq('cohort_id', cohortId)
    .maybeSingle();
  if (
    !cohort ||
    (cohort as { programme_id: string }).programme_id !== programmeId
  ) {
    return { ok: false, error: 'Cohort not found or not yours.' };
  }
  return { ok: true, startDate: (cohort as { start_date: string }).start_date };
}

/**
 * Insert the COHORT_ONLY checklist row for a freshly-created cohort-only
 * activity — born included, with the week-pacing default release
 * (cohort start + (unit_index - 1) × 7 days), matching template seeding +
 * createCohortOnlyActivityAction.
 */
export async function insertCohortOnlyChecklistRow(
  supabase: SupabaseClient,
  cohortId: string,
  activityId: string,
  unitIndex: number,
  startDate: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const releaseDate = new Date(
    new Date(`${startDate}T00:00:00Z`).getTime() +
      (unitIndex - 1) * 7 * DAY_MS,
  )
    .toISOString()
    .slice(0, 10);
  const { error } = await supabase
    .from('nclex_cohort_checklist_items')
    .insert({
      cohort_id: cohortId,
      template_activity_id: activityId,
      is_included: true,
      release_date: releaseDate,
      source: 'COHORT_ONLY',
    });
  if (error) {
    return { ok: false, error: 'Could not add the activity. Please try again.' };
  }
  return { ok: true };
}
