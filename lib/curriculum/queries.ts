// mynclex/lib/curriculum/queries.ts
//
// Server-side fetches for the curriculum tutor surfaces (slice 9.3a
// onwards). RLS on nclex_programme_units / _blocks / _activities
// scopes everything to programmes owned by the signed-in tutor.

import { createClient } from '@/lib/supabase/server';
import type {
  ProgrammeActivity,
  ProgrammeUnit,
  UnitDetail,
  UnitGridRow,
} from './types';
import type { DeliveryMode, UnitLabel } from '@/lib/programmes/types';

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

/**
 * Unit Builder page query — one round trip pulling the unit, its
 * activities, and the parent programme's identity / shape fields
 * needed for the unit-label render and the curriculum-tab back
 * link. Returns null when the unit doesn't exist OR the tutor
 * doesn't own its parent programme; the page turns null into a
 * 404.
 *
 * Activities are scoped to loose-only in 9.3b (block_id IS NULL).
 * Blocks land in 9.3c — when that arrives the picker query will
 * also include block-scoped activities; for now any block-scoped
 * rows (none yet) get filtered out at the DB.
 */
export async function getUnitDetail(
  unitId: string
): Promise<UnitDetail | null> {
  const supabase = await createClient();

  // PostgREST embed pulls the parent programme in one trip.
  const { data, error } = await supabase
    .from('nclex_programme_units')
    .select(
      `unit_id, programme_id, unit_index, title, description,
       is_published, created_at, updated_at,
       nclex_programmes!inner(
         programme_id, delivery_mode, unit_label, length_units
       )`
    )
    .eq('unit_id', unitId)
    .maybeSingle();

  if (error || !data) return null;

  const programmeRaw = (data as typeof data & {
    nclex_programmes:
      | { programme_id: string; delivery_mode: DeliveryMode; unit_label: UnitLabel; length_units: number }
      | Array<{ programme_id: string; delivery_mode: DeliveryMode; unit_label: UnitLabel; length_units: number }>
      | null;
  }).nclex_programmes;
  const programme = Array.isArray(programmeRaw) ? programmeRaw[0] : programmeRaw;
  if (!programme) return null;

  const {
    unit_id, programme_id, unit_index, title, description,
    is_published, created_at, updated_at,
  } = data as ProgrammeUnit;

  const unit: ProgrammeUnit = {
    unit_id, programme_id, unit_index, title, description,
    is_published, created_at, updated_at,
  };

  // Activities — loose-only (block_id IS NULL) for slice 9.3b.
  // Blocks land in 9.3c. Ordered by ordinal so the body renders in
  // tutor-set order.
  const { data: activitiesData } = await supabase
    .from('nclex_programme_activities')
    .select(
      `activity_id, unit_id, block_id, ordinal, type, title, note,
       payload, is_published, created_at, updated_at`
    )
    .eq('unit_id', unitId)
    .is('block_id', null)
    .order('ordinal', { ascending: true });

  const activities = (activitiesData ?? []) as ProgrammeActivity[];

  return {
    unit,
    activities,
    programme: {
      programme_id: programme.programme_id,
      delivery_mode: programme.delivery_mode,
      unit_label: programme.unit_label,
      length_units: programme.length_units,
    },
  };
}
