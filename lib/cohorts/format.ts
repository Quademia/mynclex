// mynclex/lib/cohorts/format.ts
//
// Display + status derivation for cohorts. Status is intentionally
// not persisted (slice 9.2a decision) — UPCOMING / IN_PROGRESS /
// ENDED derive purely from (start_date, end_date, today); only
// CANCELLED is stored, via cancelled_at IS NOT NULL.

import type { Cohort, CohortStatus } from './types';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Derive the cohort's status from its stored fields + today.
 * Pure function — server-renderable.
 */
export function cohortStatus(
  cohort: Pick<Cohort, 'start_date' | 'end_date' | 'cancelled_at'>,
  today: Date = new Date()
): CohortStatus {
  if (cohort.cancelled_at) return 'CANCELLED';
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = parseDate(cohort.start_date);
  const end = parseDate(cohort.end_date);
  if (t < start) return 'UPCOMING';
  if (t > end) return 'ENDED';
  return 'IN_PROGRESS';
}

/**
 * Display the cohort's name. Falls back to a date-range autogen
 * when the tutor hasn't set a custom name — "5 Jan – 27 Mar 2027".
 * Same-year ranges drop the leading year, cross-year keep both.
 */
export function formatCohortName(
  cohort: Pick<Cohort, 'name' | 'start_date' | 'end_date'>
): string {
  if (cohort.name && cohort.name.trim().length > 0) return cohort.name;
  return formatDateRange(cohort.start_date, cohort.end_date);
}

/**
 * "5 Jan – 27 Mar 2027" (same year) or "20 Dec 2026 – 14 Feb 2027"
 * (cross-year). En-dash separator matches the planning-doc example.
 */
export function formatDateRange(startIso: string, endIso: string): string {
  const s = parseDate(startIso);
  const e = parseDate(endIso);
  if (s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  }
  return `${s.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
}

export function formatCohortStatusLabel(status: CohortStatus): string {
  switch (status) {
    case 'UPCOMING':    return 'Upcoming';
    case 'IN_PROGRESS': return 'Running';
    case 'ENDED':       return 'Ended';
    case 'CANCELLED':   return 'Cancelled';
  }
}

export function cohortStatusPillClass(status: CohortStatus): string {
  switch (status) {
    case 'UPCOMING':    return 'is-upcoming';
    case 'IN_PROGRESS': return 'is-running';
    case 'ENDED':       return 'is-ended';
    case 'CANCELLED':   return 'is-cancelled';
  }
}

/**
 * Seat-cap display for the card. NULL = no cap.
 * Real enrolled-count rollup lands when nclex_enrolments ships.
 */
export function formatCohortSeats(size: number | null): string {
  if (size == null) return 'No seat cap';
  return `0 of ${size} students`;
}
