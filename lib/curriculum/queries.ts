// mynclex/lib/curriculum/queries.ts
//
// Server-side fetches for the curriculum tutor surfaces (slice 9.3a
// onwards). RLS on nclex_programme_units / _blocks / _activities
// scopes everything to programmes owned by the signed-in tutor.

import { createClient } from '@/lib/supabase/server';
import type { UnitGridRow } from './types';

/**
 * Units Overview grid query. One row per unit slot, with rolled-up
 * block + activity counts for the card meta line. Ordered by the
 * unit's position in the programme.
 *
 * Returns [] when the programme has no units (shouldn't happen
 * post-backfill, but the empty list renders harmlessly) or when
 * the tutor doesn't own the programme (RLS filters them out).
 */
export async function getUnitsForProgramme(
  programmeId: string
): Promise<UnitGridRow[]> {
  const supabase = await createClient();

  // PostgREST embedded count — `nclex_programme_blocks(count)` and
  // `nclex_programme_activities(count)` return `[{ count: N }]`
  // per parent row; we flatten below. Cheaper than two extra round
  // trips per unit.
  const { data, error } = await supabase
    .from('nclex_programme_units')
    .select(
      `unit_id, programme_id, unit_index, title, description,
       is_published, created_at, updated_at,
       nclex_programme_blocks(count),
       nclex_programme_activities(count)`
    )
    .eq('programme_id', programmeId)
    .order('unit_index', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => {
    const {
      nclex_programme_blocks,
      nclex_programme_activities,
      ...rest
    } = row as typeof row & {
      nclex_programme_blocks: Array<{ count: number }> | null;
      nclex_programme_activities: Array<{ count: number }> | null;
    };
    return {
      ...rest,
      block_count: nclex_programme_blocks?.[0]?.count ?? 0,
      activity_count: nclex_programme_activities?.[0]?.count ?? 0,
    } as UnitGridRow;
  });
}
