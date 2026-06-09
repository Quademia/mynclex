// mynclex/lib/programmes/format.ts
//
// Display helpers for the programme list cards.
// Slice 9.2a — schedule line replaced by cohort-count line; the
// per-date schedule string now belongs to cohorts (a future
// cohort-format helper will render that for the Cohorts tab in
// slice 9.2c).

import type { Currency, ProgrammeHealth, ProgrammeStatus, UnitLabel } from './types';

const CURRENCY_SYMBOL: Record<Currency, string> = { GHS: '₵', USD: '$' };

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Single ISO date ("2026-07-14") → "14 Jul 2026" for the card's
 * "Next cohort starts {date}" line. Parsed component-wise to avoid the
 * UTC-shift that `new Date(iso)` can introduce near midnight.
 */
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * Card price line. `0` renders as "Free"; otherwise the currency
 * symbol + the whole-cedi/dollar amount (minor → major). Thousands
 * grouped ("₵1,200"). NULL minor (transient mid-create) → "—".
 */
export function formatPrice(minor: number | null, currency: Currency): string {
  if (minor == null) return '—';
  if (minor === 0) return 'Free';
  const major = minor / 100;
  const shown = Number.isInteger(major) ? major : Number(major.toFixed(2));
  return `${CURRENCY_SYMBOL[currency]}${shown.toLocaleString()}`;
}

/** Health band → short label for the card meter row. */
export function formatHealthLabel(health: ProgrammeHealth): string {
  return health === 'on-track' ? 'On track' : 'Needs a look';
}

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
