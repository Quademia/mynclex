// mynclex/lib/programmes/queries.ts
//
// Server-side fetches for the programme tutor surfaces.
// Slice 9.1a — getMyProgrammes for the My Programmes list page.
//
// RLS scopes the SELECT to tutor_id = auth.uid() (with SUPER_ADMIN
// bypass via nclex_programmes_admin_all). Co-tutored programmes will
// join in once the co-tutor join table lands; for v1 the creator is
// the sole tutor.

import { createClient } from '@/lib/supabase/server';
import type { ProgrammeListRow } from './types';

export async function getMyProgrammes(): Promise<ProgrammeListRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_programmes')
    .select(
      'programme_id, title, tagline, description, length_weeks, start_date, end_date, cohort_size, price_minor_ghs, price_minor_usd, show_price_publicly, status, updated_at'
    )
    .order('updated_at', { ascending: false });

  if (error || !data) return [];
  return data as ProgrammeListRow[];
}

/**
 * Lookup for the programme-scoped shell — fetches the title (and
 * confirms the programme is visible to the signed-in tutor via RLS).
 * Returns null if the programme doesn't exist OR the tutor doesn't
 * own it; the shell turns null into a 404.
 *
 * Invalid UUIDs in the URL also return null (Supabase returns an
 * error for malformed UUID input on a uuid column).
 */
export async function getProgrammeForShell(
  programmeId: string
): Promise<{ programme_id: string; title: string } | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_programmes')
    .select('programme_id, title')
    .eq('programme_id', programmeId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}
