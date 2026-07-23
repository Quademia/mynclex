// mynclex/lib/home/student/streak.ts
//
// The study-streak maths, pure and shared. Lifted out of
// overview-queries.ts (where it was a private function) when the Bank
// dashboard needed the same rule — two homes computing "what is my
// streak?" differently would be a bug students could see, so there is
// one implementation and both feed it a list of timestamps.
//
// What each home feeds it differs, and that is the point:
//   • the programme home  → activity-completion timestamps
//   • the bank dashboard  → bank attempt timestamps (CUSTOM_BUILT incl.
//     CAT + READINESS_PACK; programme-assigned attempts belong to the
//     programme home's streak, not this one)
//
// UTC day buckets match the calendar day for the core audience
// (Ghana, UTC+0).

import type { OverviewStreak } from './types';

const DAY_MS = 86_400_000;

/** Distinct UTC day numbers, ignoring unparseable timestamps. */
function dayNumbers(iso: string[]): Set<number> {
  const days = new Set<number>();
  for (const s of iso) {
    const t = new Date(s).getTime();
    if (!Number.isNaN(t)) days.add(Math.floor(t / DAY_MS));
  }
  return days;
}

/**
 * Bucket timestamps into UTC days, then derive the current run (held if
 * the latest study day is today or yesterday — a day's grace so "haven't
 * studied yet today" doesn't read as a broken streak) and the longest
 * run ever.
 */
export function studyStreak(activeAtIso: string[], nowMs: number): OverviewStreak {
  const days = dayNumbers(activeAtIso);
  if (days.size === 0) return { current: 0, best: 0 };

  const sorted = [...days].sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }

  const today = Math.floor(nowMs / DAY_MS);
  let cursor: number;
  if (days.has(today)) cursor = today;
  else if (days.has(today - 1)) cursor = today - 1;
  else return { current: 0, best };

  let current = 0;
  while (days.has(cursor)) {
    current += 1;
    cursor -= 1;
  }
  return { current, best };
}

/**
 * The week strip: was there activity on each of the last `count` days,
 * oldest-first, ending with today. Drawn from the same timestamps as the
 * streak so the cells and the number can never disagree.
 */
export function activeDayFlags(
  activeAtIso: string[],
  nowMs: number,
  count = 7,
): boolean[] {
  const days = dayNumbers(activeAtIso);
  const today = Math.floor(nowMs / DAY_MS);
  const flags: boolean[] = [];
  for (let i = count - 1; i >= 0; i--) flags.push(days.has(today - i));
  return flags;
}
