// mynclex/lib/practice/history/programme-queries.ts
//
// Progress engine Slice 4 — server-side fetcher for the per-
// programme attempt history page. Parallel to the bank-side
// queries.ts but tuned for programme attempts:
//   • filters source = 'PROGRAMME_ASSIGNED' on the attempts query
//     (the bank side filters PROGRAMME_ASSIGNED OUT — same column,
//     opposite sides);
//   • joins through activity → unit to surface activity title +
//     unit label in the row;
//   • scopes to a single programme (passed as arg) by filtering
//     the activity-join's parent programme_id;
//   • merges in the progress map (Slice 1) so each row carries
//     its activity_is_done flag for the DONE badge.
//
// Implementation note: nclex_attempts.programme_activity_id is
// TEXT (forward-reference per the schema comment), not a real FK
// to nclex_programme_activities. PostgREST embed (!inner) needs a
// real FK, so we resolve via three separate queries instead of one
// embedded query — pragmatic for v1 over a SECURITY DEFINER RPC.
// The dataset is bounded (one student's programme attempts) so the
// extra round trips are cheap.

import { createClient } from '@/lib/supabase/server';
import {
  MODES_STUDY,
  MODES_EXAM,
  type Intent,
  type ModeId,
} from '@/lib/practice/builder/filter-config';
import { getActivityProgressMap } from '@/lib/progress/queries';
import type {
  AttemptStatus,
  ProgrammeActivityType,
  ProgrammeHistoryAttempt,
} from './programme-types';

const ATTEMPT_FETCH_LIMIT = 200; // generous safety cap before per-programme filter
const ROW_RETURN_LIMIT = 50;     // matches the bank-side history page

/**
 * All programme-assigned attempts the caller has in the named
 * programme, newest first. Empty array on error or no matches.
 *
 * RLS scopes the underlying SELECT on nclex_attempts to the
 * caller's own rows; the programme-side scope comes from the
 * unit's programme_id (joined in pass 2).
 */
export async function getProgrammeHistoryAttempts(
  programmeId: string
): Promise<ProgrammeHistoryAttempt[]> {
  const supabase = await createClient();

  // 1) Pull the caller's programme-assigned attempts. No programme
  // filter here — applied after we resolve activities to units.
  const { data: rawAttempts, error: aErr } = await supabase
    .from('nclex_attempts')
    .select(
      `attempt_id, created_at, status, intent, mode,
       final_score, pass_score, programme_activity_id`
    )
    .eq('source', 'PROGRAMME_ASSIGNED')
    .not('programme_activity_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(ATTEMPT_FETCH_LIMIT);

  if (aErr || !rawAttempts || rawAttempts.length === 0) return [];

  const activityIds = Array.from(
    new Set(
      rawAttempts
        .map((r) => r.programme_activity_id as string | null)
        .filter((id): id is string => id !== null)
    )
  );
  if (activityIds.length === 0) return [];

  // 2) Resolve activities + parent units, scoped to this programme.
  // Attempts whose activity isn't in this programme drop out of the
  // result naturally (no entry in activityMap → skipped below).
  const { data: activities, error: actErr } = await supabase
    .from('nclex_programme_activities')
    .select(
      `activity_id, title, type, unit_id,
       nclex_programme_units!inner(programme_id, unit_index, title)`
    )
    .in('activity_id', activityIds)
    .eq('nclex_programme_units.programme_id', programmeId);

  if (actErr || !activities) return [];

  type ActivityRow = {
    activity_id: string;
    title: string;
    type: string;
    unit_id: string;
    nclex_programme_units:
      | { programme_id: string; unit_index: number; title: string | null }
      | Array<{
          programme_id: string;
          unit_index: number;
          title: string | null;
        }>
      | null;
  };

  const activityMap = new Map<
    string,
    {
      title: string;
      type: ProgrammeActivityType;
      unit_index: number;
      unit_title: string | null;
    }
  >();
  for (const row of activities as ActivityRow[]) {
    const unitRaw = row.nclex_programme_units;
    const unit = Array.isArray(unitRaw) ? unitRaw[0] : unitRaw;
    if (!unit) continue;
    activityMap.set(row.activity_id, {
      title: row.title,
      type: row.type as ProgrammeActivityType,
      unit_index: unit.unit_index,
      unit_title: unit.title,
    });
  }

  // 3) Progress map for the same activity ids — drives the DONE
  // badge. RLS scopes to caller's own progress rows.
  const inScopeActivityIds = Array.from(activityMap.keys());
  const progressMap = await getActivityProgressMap(inScopeActivityIds);

  // 4) Merge + filter to this programme + cap at ROW_RETURN_LIMIT.
  const out: ProgrammeHistoryAttempt[] = [];
  for (const att of rawAttempts) {
    const activityId = att.programme_activity_id as string;
    const activity = activityMap.get(activityId);
    if (!activity) continue; // attempt's activity belongs to another programme

    const intent = att.intent as Intent;
    const mode = att.mode as ModeId;
    const modeList = intent === 'STUDY' ? MODES_STUDY : MODES_EXAM;
    const modeLabel = modeList.find((m) => m.id === mode)?.label ?? mode;

    out.push({
      attempt_id: att.attempt_id,
      created_at: att.created_at,
      status: att.status as AttemptStatus,
      mode_label: modeLabel,
      final_score: att.final_score,
      pass_score: att.pass_score,
      activity_id: activityId,
      activity_title: activity.title,
      activity_type: activity.type,
      unit_index: activity.unit_index,
      unit_title: activity.unit_title,
      activity_is_done: progressMap.has(activityId),
    });

    if (out.length >= ROW_RETURN_LIMIT) break;
  }

  return out;
}

/**
 * Cohort variant — resolves the cohort's parent programme, then
 * delegates. The cohort layer is the access gate, not the attempt
 * scope (attempts attach to the template programme via the activity,
 * not to a cohort). Two cohort routes of the same programme would
 * see the same attempt rows.
 *
 * Returns null when the cohort isn't readable (RLS hid it).
 */
export async function getCohortHistoryAttempts(
  cohortId: string
): Promise<ProgrammeHistoryAttempt[] | null> {
  const supabase = await createClient();

  const { data: cohort, error } = await supabase
    .from('nclex_cohorts')
    .select('cohort_id, programme_id')
    .eq('cohort_id', cohortId)
    .maybeSingle();

  if (error || !cohort) return null;

  return getProgrammeHistoryAttempts(cohort.programme_id);
}
