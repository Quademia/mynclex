// mynclex/lib/programmes/format.ts
//
// Display helpers for the programme list cards.
// Slice 9.2a — schedule line replaced by cohort-count line; the
// per-date schedule string now belongs to cohorts (a future
// cohort-format helper will render that for the Cohorts tab in
// slice 9.2c).

import type { ProgrammeStatus, UnitLabel } from './types';

/**
 * Cohort-count line for the programme card. Replaces the
 * slice-9.1 schedule string. Backfilled programmes get "1 cohort";
 * new programmes start at "No cohorts yet" until the tutor adds
 * a first cohort in the 9.2b flow.
 *
 * Plural-aware; ignores SELF_PACED programmes (cohort layer doesn't
 * apply — caller should branch on delivery_mode before calling).
 */
export function formatCohortCount(count: number): string {
  if (count === 0) return 'No cohorts yet';
  if (count === 1) return '1 cohort';
  return `${count} cohorts`;
}

/**
 * Programme "shape" line — length + unit label. Renders as
 * "8 weeks" or "6 modules" depending on the programme's unit_label.
 * Used as the secondary line on the card alongside the cohort
 * count.
 */
export function formatLength(
  lengthUnits: number,
  unitLabel: UnitLabel
): string {
  const noun = unitLabel === 'WEEK' ? 'week' : 'module';
  return `${lengthUnits} ${noun}${lengthUnits === 1 ? '' : 's'}`;
}

export function formatStatusLabel(status: ProgrammeStatus): string {
  switch (status) {
    case 'PUBLISHED': return 'Live';
    case 'DRAFT':     return 'Draft';
    case 'ARCHIVED':  return 'Archived';
  }
}

export function statusPillClass(status: ProgrammeStatus): string {
  switch (status) {
    case 'PUBLISHED': return 'is-live';
    case 'DRAFT':     return 'is-draft';
    case 'ARCHIVED':  return 'is-archived';
  }
}
