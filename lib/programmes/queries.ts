// mynclex/lib/programmes/queries.ts
//
// Server-side fetches for the programme tutor surfaces.
// Slice 9.2a — programmes lose date/seat columns to nclex_cohorts;
// the list rollup folds cohort counts into each row.
//
// RLS scopes SELECT to tutor_id = auth.uid() (SUPER_ADMIN bypass via
// nclex_programmes_admin_all). Co-tutored programmes will join in
// once the co-tutor join table lands; for v1 the creator is the sole
// tutor.

import { createClient } from '@/lib/supabase/server';
import type { ProgrammeListRow } from './types';

export async function getMyProgrammes(): Promise<ProgrammeListRow[]> {
  const supabase = await createClient();

  // PostgREST embedded resource — `nclex_cohorts(count)` returns
  // `[{ count: N }]` per row; we flatten below. RLS on
  // nclex_cohorts uses the same tutor-ownership rule via the
  // programme FK, so the count returned only includes cohorts
  // the tutor is allowed to see (== all of their own).
  const { data, error } = await supabase
    .from('nclex_programmes')
    .select(
      `programme_id, title, tagline, description,
       delivery_mode, unit_label, length_units,
       price_currency, price_minor, show_price_publicly,
       payment_collection_mode, access_window_days,
       status, updated_at,
       nclex_cohorts(count)`
    )
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => {
    const { nclex_cohorts, ...rest } = row as typeof row & {
      nclex_cohorts: Array<{ count: number }> | null;
    };
    const cohort_count = nclex_cohorts?.[0]?.count ?? 0;
    return { ...rest, cohort_count } as ProgrammeListRow;
  });
}

/**
 * Lookup for the programme-scoped shell — returns identity + the
 * delivery / length / label fields that drive nav filtering (e.g.
 * SELF_PACED hides the Cohorts tab) and modal pre-fills (e.g.
 * end-date auto-fill in the cohort form uses length_units).
 *
 * RLS scopes the SELECT to tutor_id = auth.uid() (SUPER_ADMIN
 * bypass via nclex_programmes_admin_all). Returns null if the
 * programme doesn't exist OR the tutor doesn't own it; the shell
 * turns null into a 404.
 *
 * Invalid UUIDs in the URL also return null (Supabase returns an
 * error for malformed UUID input on a uuid column).
 */
import type { DeliveryMode, UnitLabel } from './types';

export type ProgrammeShellContext = {
  programme_id: string;
  title: string;
  delivery_mode: DeliveryMode;
  unit_label: UnitLabel;
  length_units: number;
};

export async function getProgrammeForShell(
  programmeId: string
): Promise<ProgrammeShellContext | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_programmes')
    .select('programme_id, title, delivery_mode, unit_label, length_units')
    .eq('programme_id', programmeId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ProgrammeShellContext;
}

/**
 * Focused projection for the Overview page's Publish / Archive
 * controls. Slice 9.3e — kept separate from the shell context so
 * the chrome contract stays narrow (status/timestamps are a
 * concern of one page, not every page under a programme).
 */
export type ProgrammeStatusContext = {
  programme_id: string;
  title: string;
  status: import('./types').ProgrammeStatus;
  published_at: string | null;
  archived_at: string | null;
};

export async function getProgrammeStatus(
  programmeId: string
): Promise<ProgrammeStatusContext | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nclex_programmes')
    .select('programme_id, title, status, published_at, archived_at')
    .eq('programme_id', programmeId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ProgrammeStatusContext;
}
