// mynclex/lib/programmes/format.ts
//
// Display helpers for the programme list cards (slice 9.1a).
// Pure functions — server-renderable.

import type { ProgrammeStatus } from './types';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDate(iso: string): Date {
  // 'YYYY-MM-DD' → local midnight Date
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtShort(date: Date): string {
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

/**
 * Smart schedule line, derived from the dates + today:
 *   • today < start_date     → "Starts Mon 19 May"
 *   • start ≤ today ≤ end    → "Week 3 of 8 · Mon 5 May → Fri 27 Jun"
 *   • today > end_date       → "Ended Fri 27 Jun"
 */
export function formatSchedule(
  start_date: string,
  end_date: string,
  length_weeks: number
): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseDate(start_date);
  const end = parseDate(end_date);

  if (today < start) return `Starts ${fmtShort(start)}`;
  if (today > end) return `Ended ${fmtShort(end)}`;

  const daysIn = diffDays(today, start);
  const weekIdx = Math.min(length_weeks, Math.floor(daysIn / 7) + 1);
  return `Week ${weekIdx} of ${length_weeks} · ${fmtShort(start)} → ${fmtShort(end)}`;
}

/**
 * Students line for the card. v1 uses cohort_size only; real enrolled
 * count lands when nclex_enrolments ships.
 */
export function formatStudents(cohortSize: number | null): string {
  if (cohortSize == null) return '— students';
  return `0 of ${cohortSize} students`;
}

export function formatStatusLabel(status: ProgrammeStatus): string {
  switch (status) {
    case 'PUBLISHED': return 'Live';
    case 'DRAFT':     return 'Draft';
    case 'ARCHIVED':  return 'Archived';
    case 'CANCELLED': return 'Cancelled';
  }
}

export function statusPillClass(status: ProgrammeStatus): string {
  switch (status) {
    case 'PUBLISHED': return 'is-live';
    case 'DRAFT':     return 'is-draft';
    case 'ARCHIVED':  return 'is-archived';
    case 'CANCELLED': return 'is-cancelled';
  }
}
