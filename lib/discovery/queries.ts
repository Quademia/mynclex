// mynclex/lib/discovery/queries.ts
//
// Public discovery reads. All go through the nclex_public_programmes
// view (curated projection, owner-rights) — never the base tables. The
// anon Supabase client is enough; no auth required.

import { createClient } from '@/lib/supabase/server';
import type { PublicProgramme, PublicUnit, PublicCohort } from './types';

// The discovery list. The view already gates on PUBLISHED + active
// tutor; here we apply the LIST-only open-cohort rule: tutor-led shows
// only with >= 1 open cohort, self-paced always shows (no cohort layer
// to gate on). Sorted by soonest cohort, self-paced (no date) last.
export async function getDiscoveryProgrammes(): Promise<PublicProgramme[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_public_programmes')
    .select('*')
    .order('next_cohort_start', { ascending: true, nullsFirst: false });

  if (error || !data) return [];

  return (data as PublicProgramme[]).filter(
    (p) => p.delivery_mode === 'SELF_PACED' || p.open_cohort_count > 0
  );
}

// Single programme for the detail page. Reads the same public view by
// id — returns null if it isn't publicly visible (not published /
// inactive tutor / bad id), which the page turns into a 404. No
// open-cohort gate here: a published programme is viewable even with no
// open cohort (you just can't enrol).
export async function getPublicProgramme(
  programmeId: string
): Promise<PublicProgramme | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_public_programmes')
    .select('*')
    .eq('programme_id', programmeId)
    .maybeSingle();

  if (error || !data) return null;
  return data as PublicProgramme;
}

// Published units (the syllabus), ordered.
export async function getPublicUnits(
  programmeId: string
): Promise<PublicUnit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_public_units')
    .select('*')
    .eq('programme_id', programmeId)
    .order('unit_index', { ascending: true });

  if (error || !data) return [];
  return data as PublicUnit[];
}

// Current + upcoming cohorts (ended ones dropped), soonest first.
export async function getPublicCohorts(
  programmeId: string
): Promise<PublicCohort[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('nclex_public_cohorts')
    .select('*')
    .eq('programme_id', programmeId)
    .gte('end_date', today)
    .order('start_date', { ascending: true });

  if (error || !data) return [];
  return data as PublicCohort[];
}
