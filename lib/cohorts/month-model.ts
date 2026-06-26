// mynclex/lib/cohorts/month-model.ts
//
// Tutor adapter for the curriculum Month view (Slice 1). Turns the
// cohort checklist tree (the SAME data the list/two-pane already loads)
// into the normalised `MonthWeek[]` the shared <CurriculumMonthView>
// renders. No new reads — pure projection.
//
// Placement: each row sits on its `release_date` (always populated —
// trigger-seeded or a computed week-pacing default). A row whose date is
// still the computed default (`release_is_default`) is flagged `undated`
// so it reads as "not scheduled yet" rather than genuinely due that day;
// the default already lands near the week start, honouring the
// "undated → first day of its week" rule.
//
// Tutor sees EVERYTHING: included + excluded + unconfigured rows.
// Excluded rows render greyed ("excl"); unconfigured rows render normally
// (they carry default dates) — the list view is where inclusion is
// decided, this is just the time projection.

import {
  addDays,
  dayGroupLabel,
  isoOf,
  monthBandLabel,
  parseISODate,
  shortDate,
  todayLocal,
  type MonthChip,
  type MonthDayGroup,
  type MonthWeek,
} from '@/lib/curriculum/month-view';
import { unitLabel } from '@/lib/curriculum/format';
import type {
  CohortChecklistActivityRow,
  CohortChecklistTree,
} from './types';

// A flattened checklist row + the block ref ("B1") it inherits, in body
// order, so chips can show their block thread.
type FlatRow = { row: CohortChecklistActivityRow; blockRef: string | null };

function flattenWeek(
  unit: CohortChecklistTree['units'][number]
): FlatRow[] {
  const out: FlatRow[] = [];
  let blockCounter = 0;
  for (const entry of unit.body) {
    if (entry.kind === 'block') {
      blockCounter += 1;
      const ref = `B${blockCounter}`;
      for (const row of entry.rows) out.push({ row, blockRef: ref });
    } else {
      out.push({ row: entry.row, blockRef: null });
    }
  }
  return out;
}

function toChip(fr: FlatRow): MonthChip {
  const { row, blockRef } = fr;
  return {
    id: row.activity.activity_id,
    unitId: row.activity.unit_id,
    type: row.activity.type,
    title: row.activity.title,
    blockRef,
    variant: row.state === 'excluded' ? 'excluded' : 'normal',
    due: row.due_date != null,
    undated: row.release_is_default,
  };
}

/**
 * Build the tutor Month model. `todayIso` defaults to the client's
 * local today (the view is client-rendered) so "today" highlights
 * correctly; injectable for tests.
 */
export function buildCohortMonthWeeks(
  tree: CohortChecklistTree,
  todayIso: string = isoOf(todayLocal())
): MonthWeek[] {
  const start = parseISODate(tree.cohort.start_date);
  let prevMonthKey: string | null = null;

  return tree.units.map((unit, i) => {
    // Cohort-relative week start — month-band anchor + empty-week fallback.
    const weekStart = addDays(start, i * 7);
    const monthKey = `${weekStart.getFullYear()}-${weekStart.getMonth()}`;
    const monthBand =
      monthKey !== prevMonthKey ? monthBandLabel(weekStart) : null;
    prevMonthKey = monthKey;

    // Bucket the week's rows by their placement date.
    const byDate = new Map<string, MonthChip[]>();
    for (const fr of flattenWeek(unit)) {
      const dateIso = fr.row.release_date;
      const chip = toChip(fr);
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
    };
  });
}

/** "Aug 2 → Sep 26 · 8 weeks" — derived from start + week count. */
export function cohortRangeLabel(tree: CohortChecklistTree): string {
  const n = tree.units.length;
  const start = parseISODate(tree.cohort.start_date);
  const end = addDays(start, n * 7 - 1);
  const noun = tree.programme.unit_label === 'MODULE' ? 'modules' : 'weeks';
  return `${shortDate(start)} → ${shortDate(end)} · ${n} ${noun}`;
}
