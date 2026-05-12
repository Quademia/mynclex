// mynclex/lib/cohorts/queries.ts
//
// Server-side fetches for cohort surfaces (slices 9.2b + 9.2c).
// RLS scopes SELECT to programmes owned by the signed-in tutor
// (parent-ownership subquery — see db/rls.sql nclex_cohorts).

import { createClient } from '@/lib/supabase/server';
import type { Cohort, CohortListRow } from './types';
import type {
  DeliveryMode,
  UnitLabel,
} from '@/lib/programmes/types';

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

/**
 * Lookup for the cohort-scoped shell (slice 9.2c). Returns the
 * cohort row plus the parent programme's identity / shape fields
 * that drive the shell + sidebar + back-pill.
 *
 * RLS scopes both joined rows to the signed-in tutor (cohort via
 * parent-ownership subquery, programme via tutor_id check).
 * Returns null if the cohort doesn't exist OR the tutor doesn't
 * own its parent programme; the shell turns null into a 404.
 *
 * Invalid UUIDs in the URL also return null.
 */
export type CohortShellContext = {
  cohort: Cohort;
  programme: {
    programme_id: string;
    title: string;
    delivery_mode: DeliveryMode;
    unit_label: UnitLabel;
    length_units: number;
  };
};

export async function getCohortForShell(
  cohortId: string
): Promise<CohortShellContext | null> {
  const supabase = await createClient();

  // Embedded select pulls the parent programme in the same round
  // trip; PostgREST returns the programme as a nested object.
  const { data, error } = await supabase
    .from('nclex_cohorts')
    .select(
      `cohort_id, programme_id, name, start_date, end_date,
       cohort_size, allow_late_join, cancelled_at,
       created_at, updated_at,
       nclex_programmes!inner(
         programme_id, title, delivery_mode, unit_label, length_units
       )`
    )
    .eq('cohort_id', cohortId)
    .maybeSingle();

  if (error || !data) return null;

  // PostgREST returns the embedded row either as a single object
  // or as an array depending on the relationship inference; the
  // FK relationship here is many-to-one so it's always one row,
  // but we defensively handle both shapes.
  const programmeRaw = (data as typeof data & {
    nclex_programmes:
      | CohortShellContext['programme']
      | CohortShellContext['programme'][]
      | null;
  }).nclex_programmes;
  const programme = Array.isArray(programmeRaw) ? programmeRaw[0] : programmeRaw;
  if (!programme) return null;

  const {
    cohort_id, programme_id, name, start_date, end_date, cohort_size,
    allow_late_join, cancelled_at, created_at, updated_at,
  } = data as Cohort;

  return {
    cohort: {
      cohort_id, programme_id, name, start_date, end_date, cohort_size,
      allow_late_join, cancelled_at, created_at, updated_at,
    },
    programme,
  };
}
