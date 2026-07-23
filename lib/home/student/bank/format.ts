// mynclex/lib/home/student/bank/format.ts
//
// Pure derivations for the Bank Dashboard. Kept out of queries.ts so the
// wording rules can be unit-tested without a database — several of them
// exist to satisfy the honesty rule and would otherwise only be checked
// by looking at the page.

import type { BankAccessCard, BankStreak } from './types';
import { activeDayFlags, bankStudyStreak } from './streak';

/**
 * "Thursday, 23 July" — the design's date line. Built from two formats
 * rather than one: en-GB renders the whole thing without the comma
 * ("Thursday 23 July") and en-US puts the month first, so neither
 * single locale gives the shape we want.
 */
export function todayLabel(now: Date): string {
  const weekday = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(now);
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(now);
  return `${weekday}, ${date}`;
}

/**
 * The countdown card. The bar is drawn from the SAME row that produced
 * the number, so the two can never tell different stories; with no
 * window length we show the number and no bar rather than invent a
 * denominator.
 */
export function accessCard(
  daysLeft: number | null,
  windowDays: number | null,
): BankAccessCard | null {
  if (daysLeft === null) return null;
  const percentLeft =
    windowDays && windowDays > 0
      ? Math.min(100, Math.max(0, Math.round((daysLeft / windowDays) * 100)))
      : null;
  return {
    daysLeft,
    windowDays,
    label: windowDays ? `Bank ${windowDays}-day` : 'Bank access',
    percentLeft,
  };
}

/**
 * The streak line. Reads the run against the student's own best rather
 * than against a target we made up.
 */
export function streakCaption(current: number, best: number): string {
  if (current === 0) {
    return best > 0
      ? 'Your streak has lapsed — answer a question today to start again'
      : 'Answer a question today to start your streak';
  }
  if (current >= best) return 'Your best run yet — keep it alive today';
  const gap = best - current;
  return `${gap} ${gap === 1 ? 'day' : 'days'} off your best — keep it alive today`;
}

/** Assemble the whole streak card from one feed of answered-at timestamps. */
export function bankStreak(answeredAtIso: string[], nowMs: number): BankStreak {
  const { current, best } = bankStudyStreak(answeredAtIso, nowMs);
  return {
    current,
    best,
    days: activeDayFlags(answeredAtIso, nowMs, 7),
    caption: streakCaption(current, best),
  };
}
