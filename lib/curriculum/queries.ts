// mynclex/lib/curriculum/queries.ts
//
// Server-side fetches for the curriculum tutor surfaces (slice 9.3a
// onwards). RLS on nclex_programme_units / _blocks / _activities
// scopes everything to programmes owned by the signed-in tutor.

import { createClient } from '@/lib/supabase/server';
import type {
  ProgrammeActivity,
  ProgrammeBlock,
  ProgrammeUnit,
  UnitDetail,
  UnitGridRow,
} from './types';
import type { DeliveryMode, UnitLabel, ProgrammeStatus } from '@/lib/programmes/types';

/**
 * Units Overview grid query. One row per unit slot, with rolled-up
 * block + activity counts (total + published) for the card meta
 * line. Ordered by the unit's position in the programme.
 *
 * Returns [] when the programme has no units (shouldn't happen
 * post-backfill, but the empty list renders harmlessly) or when
 * the tutor doesn't own the programme (RLS filters them out).
 *
 * Five parallel reads: the units, plus total + published lists of
 * blocks/activities scoped to the programme, each filtered to
 * `cohort_id IS NULL`. Counts merged into the row map in TS. RLS
 * gates every read to the tutor's own programmes via the inner-join.
 *
 * Totals are computed from explicit filtered lists (not a PostgREST
 * embedded `(count)`) so they can exclude cohort-only rows: this is
 * the TEMPLATE overview, so cohort-only content (cohort_id set) must
 * not inflate a unit's counts. The published lists carry the same
 * `cohort_id IS NULL` filter.
 */
export async function getUnitsForProgramme(
  programmeId: string
): Promise<UnitGridRow[]> {
  const supabase = await createClient();

  const [
    unitsResult,
    totalBlocksResult,
    totalActivitiesResult,
    publishedBlocksResult,
    publishedActivitiesResult,
  ] = await Promise.all([
    supabase
      .from('nclex_programme_units')
      .select(
        `unit_id, programme_id, unit_index, title, description,
         is_published, created_at, updated_at`
      )
      .eq('programme_id', programmeId)
      .order('unit_index', { ascending: true }),
    supabase
      .from('nclex_programme_blocks')
      .select('unit_id, nclex_programme_units!inner(programme_id)')
      .is('cohort_id', null)
      .eq('nclex_programme_units.programme_id', programmeId),
    supabase
      .from('nclex_programme_activities')
      .select('unit_id, nclex_programme_units!inner(programme_id)')
      .is('cohort_id', null)
      .eq('nclex_programme_units.programme_id', programmeId),
    supabase
      .from('nclex_programme_blocks')
      .select('unit_id, nclex_programme_units!inner(programme_id)')
      .eq('is_published', true)
      .is('cohort_id', null)
      .eq('nclex_programme_units.programme_id', programmeId),
    supabase
      .from('nclex_programme_activities')
      .select('unit_id, nclex_programme_units!inner(programme_id)')
      .eq('is_published', true)
      .is('cohort_id', null)
      .eq('nclex_programme_units.programme_id', programmeId),
  ]);

  if (unitsResult.error || !unitsResult.data) return [];

  // Tally each list by unit_id.
  const countByUnit = (rows: Array<{ unit_id: string }> | null) => {
    const m = new Map<string, number>();
    for (const row of rows ?? []) {
      m.set(row.unit_id, (m.get(row.unit_id) ?? 0) + 1);
    }
    return m;
  };
  const blockCountByUnit = countByUnit(totalBlocksResult.data);
  const activityCountByUnit = countByUnit(totalActivitiesResult.data);
  const publishedBlockCountByUnit = countByUnit(publishedBlocksResult.data);
  const publishedActivityCountByUnit = countByUnit(
    publishedActivitiesResult.data
  );

  return unitsResult.data.map((rest) => {
    return {
      ...rest,
      block_count: blockCountByUnit.get(rest.unit_id) ?? 0,
      activity_count: activityCountByUnit.get(rest.unit_id) ?? 0,
      published_block_count:
        publishedBlockCountByUnit.get(rest.unit_id) ?? 0,
      published_activity_count:
        publishedActivityCountByUnit.get(rest.unit_id) ?? 0,
    } as UnitGridRow;
  });
}

/**
 * Unit Builder page query — one round trip pulling the unit, its
 * blocks, its activities (loose AND in-block), and the parent
 * programme's identity / shape fields needed for the unit-label
 * render and the curriculum-tab back link. Returns null when the
 * unit doesn't exist OR the tutor doesn't own its parent
 * programme; the page turns null into a 404.
 *
 * Slice 9.3c: blocks join the body. The activities array is no
 * longer loose-only — `composeUnitBody()` splits in-block vs.
 * loose at render time. Each list is independently ordered by
 * ordinal at the DB; merging across the two tables happens in TS.
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
         programme_id, delivery_mode, unit_label, length_units, status
       )`
    )
    .eq('unit_id', unitId)
    .maybeSingle();

  if (error || !data) return null;

  type EmbeddedProgramme = {
    programme_id: string;
    delivery_mode: DeliveryMode;
    unit_label: UnitLabel;
    length_units: number;
    status: ProgrammeStatus;
  };
  const programmeRaw = (data as typeof data & {
    nclex_programmes: EmbeddedProgramme | Array<EmbeddedProgramme> | null;
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

  // Two parallel reads — blocks + activities. RLS scopes both to
  // the tutor's own programmes; the unit row above already proved
  // ownership for this user.
  //
  // `cohort_id IS NULL` keeps this the TEMPLATE editor: cohort-only
  // rows (cohort_id set) belong to one run and live on the cohort
  // Curriculum tab, never in the programme-layer Unit Builder.
  const [blocksResult, activitiesResult] = await Promise.all([
    supabase
      .from('nclex_programme_blocks')
      .select(
        `block_id, unit_id, ordinal, title, description,
         is_published, created_at, updated_at`
      )
      .eq('unit_id', unitId)
      .is('cohort_id', null)
      .order('ordinal', { ascending: true }),
    supabase
      .from('nclex_programme_activities')
      .select(
        `activity_id, unit_id, block_id, ordinal, type, title,
         description, note, payload, is_published,
         created_at, updated_at`
      )
      .eq('unit_id', unitId)
      .is('cohort_id', null)
      .order('ordinal', { ascending: true }),
  ]);

  const blocks = (blocksResult.data ?? []) as ProgrammeBlock[];
  const activities = (activitiesResult.data ?? []) as ProgrammeActivity[];

  return {
    unit,
    blocks,
    activities,
    programme: {
      programme_id: programme.programme_id,
      delivery_mode: programme.delivery_mode,
      unit_label: programme.unit_label,
      length_units: programme.length_units,
      status: programme.status,
    },
  };
}

// composeUnitBody() lives in `./unit-body` — pure transform, no
// DB. Kept out of this module so the client-side <UnitBuilder>
// doesn't pull `next/headers` (via createClient) into its bundle.
