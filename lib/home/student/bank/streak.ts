// mynclex/lib/home/student/bank/streak.ts
//
// The BANK study streak — "I practised questions."
//
// Deliberately its own implementation, not shared with the programme
// home's streak (settled with Sam 2026-07-23). The two measure
// different achievements from different tables, and they are meant to
// be free to define a "study day" differently. They already do:
//
//   • programme home → a completed curriculum activity
//                      (nclex_student_activity_progress.completed_at)
//   • here           → an ANSWERED question
//                      (nclex_attempt_answers, SUBMITTED/AUTO_SUBMITTED)
//
// The strict rule is the point. Counting a day because an attempt row
// exists would let a student hold a streak by building a quiz, looking
// at question 1 and closing the tab — that isn't studying, and a streak
// you can keep without answering anything isn't worth keeping.
//
// CAT sittings DO count: a CAT is study, and its answers land in the
// same table. (What a CAT must never count toward is MASTERY — see
// ./accuracy, §13.2.)
//
// UTC day buckets match the calendar day for the core audience
// (Ghana, UTC+0).

const DAY_MS = 86_400_000;

export type BankStreakCounts = { current: number; best: number };

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
 * Bucket answer timestamps into UTC days, then derive the current run
 * (held if the latest study day is today or yesterday — a day's grace
 * so "haven't practised yet today" doesn't read as a broken streak) and
 * the longest run ever.
 */
export function bankStudyStreak(answeredAtIso: string[], nowMs: number): BankStreakCounts {
  const days = dayNumbers(answeredAtIso);
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
 * The week strip: was there practice on each of the last `count` days,
 * oldest-first, ending with today. Drawn from the same timestamps as
 * the streak so the cells and the number can never disagree.
 */
export function activeDayFlags(
  answeredAtIso: string[],
  nowMs: number,
  count = 7,
): boolean[] {
  const days = dayNumbers(answeredAtIso);
  const today = Math.floor(nowMs / DAY_MS);
  const flags: boolean[] = [];
  for (let i = count - 1; i >= 0; i--) flags.push(days.has(today - i));
  return flags;
}
