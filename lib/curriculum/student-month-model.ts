// mynclex/lib/curriculum/student-month-model.ts
//
// Student adapter for the curriculum Month view (Slice 2). Projects the
// student curriculum tree (the SAME data the two-pane shows) into the
// normalised `MonthWeek[]` the shared <CurriculumMonthView> renders, plus
// the flat activity list the shell needs to wire tap-to-launch (each OPEN
// chip becomes an <ActivityAction> trigger — one launch path).
//
// No new reads — pure projection. Cohort-only by nature (placement needs
// per-cohort dates), so callers only build this when `tree.cohort` is set.
//
// Chip state (done wins, then gating, then the single up-next pointer):
//   done      — isDone (green ✓)
//   locked    — openState LOCKED or CLOSED (greyed, NOT launchable)
//   up-next   — the tree's single upNextActivityId
//   normal    — available
// Placement = the activity's releaseDate; a (rare) dateless activity
// falls on the week start with the "not dated yet" cue.

import {
  addDays,
  dayGroupLabel,
  isoOf,
  monthBandLabel,
  parseISODate,
  shortDate,
  todayLocal,
  type MonthChip,
  type MonthChipVariant,
  type MonthDayGroup,
  type MonthWeek,
} from './month-view';
import { unitLabel } from './format';
import type { StudentActivity, StudentCurriculumTree } from './types';

function variantFor(
  a: StudentActivity,
  upNextActivityId: string | null
): MonthChipVariant {
  if (a.isDone) return 'done';
  if (a.openState === 'LOCKED' || a.openState === 'CLOSED') return 'locked';
  if (a.activity_id === upNextActivityId) return 'up-next';
  return 'normal';
}

/** Flatten a unit's body (block + loose) into activities, in body order. */
function flattenUnit(
  unit: StudentCurriculumTree['units'][number]
): StudentActivity[] {
  const out: StudentActivity[] = [];
  for (const entry of unit.body) {
    if (entry.kind === 'block') out.push(...entry.activities);
    else out.push(entry.activity);
  }
  return out;
}

function weekState(
  unit: StudentCurriculumTree['units'][number]
): MonthWeek['state'] {
  if (unit.progressTotal === 0) return undefined;
  if (unit.progressPct === 100) return 'done';
  const anyOpen = flattenUnit(unit).some((a) => a.openState === 'OPEN');
  return anyOpen ? 'current' : 'locked';
}

/**
 * Build the student Month model. Returns the week rows AND the flat list
 * of every activity shown (so the client shell can map chip.id → activity
 * for the launch trigger). `todayIso` defaults to the client's local
 * today; injectable for tests.
 */
export function buildStudentMonthWeeks(
  tree: StudentCurriculumTree,
  todayIso: string = isoOf(todayLocal())
): { weeks: MonthWeek[]; activities: StudentActivity[] } {
  // Guard — cohort-only. Self-paced has no timeline; callers shouldn't
  // build this, but fail safe to an empty model rather than NaN dates.
  if (!tree.cohort) return { weeks: [], activities: [] };

  const start = parseISODate(tree.cohort.start_date);
  const activities: StudentActivity[] = [];
  let prevMonthKey: string | null = null;

  const weeks = tree.units.map((unit, i) => {
    const weekStart = addDays(start, i * 7);
    const monthKey = `${weekStart.getFullYear()}-${weekStart.getMonth()}`;
    const monthBand =
      monthKey !== prevMonthKey ? monthBandLabel(weekStart) : null;
    prevMonthKey = monthKey;

    const byDate = new Map<string, MonthChip[]>();
    for (const a of flattenUnit(unit)) {
      activities.push(a);
      const dateIso = a.releaseDate ?? isoOf(weekStart);
      const chip: MonthChip = {
        id: a.activity_id,
        unitId: a.unit_id,
        type: a.type,
        title: a.title,
        blockRef: null, // students don't see block refs (tutor-only)
        variant: variantFor(a, tree.upNextActivityId),
        due: a.dueDate != null,
        undated: a.releaseDate == null,
      };
      const bucket = byDate.get(dateIso);
      if (bucket) bucket.push(chip);
      else byDate.set(dateIso, [chip]);
    }

    const dayGroups: MonthDayGroup[] = [...byDate.keys()]
      .sort()
      .map((dateIso) => {
        const d = parseISODate(dateIso);
        return {
          key: dateIso,
          dateLabel: dayGroupLabel(d),
          isToday: dateIso === todayIso,
          chips: byDate.get(dateIso)!,
        };
      });

    return {
      key: unit.unit.unit_id,
      label: unitLabel(unit.unit.unit_index, tree.programme.unit_label),
      monthBand,
      dayGroups,
      progressPct: unit.progressPct,
      state: weekState(unit),
    };
  });

  return { weeks, activities };
}

/** "Aug 2 → Sep 26 · 8 weeks" — derived from start + week count. */
export function studentRangeLabel(tree: StudentCurriculumTree): string {
  if (!tree.cohort) return '';
  const n = tree.units.length;
  const start = parseISODate(tree.cohort.start_date);
  const end = addDays(start, n * 7 - 1);
  const noun = tree.programme.unit_label === 'MODULE' ? 'modules' : 'weeks';
  return `${shortDate(start)} → ${shortDate(end)} · ${n} ${noun}`;
}
