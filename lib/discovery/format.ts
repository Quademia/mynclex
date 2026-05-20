// mynclex/lib/discovery/format.ts
//
// Display helpers for the public discovery surfaces. Single-currency
// per programme (Slice 3a) — the tutor's configured currency, shown
// as-is. An FX "≈ equivalent" hint is deferred polish.

import type { Currency, UnitLabel } from '@/lib/programmes/types';
import type { PublicProgramme, PublicCohort } from './types';

// Avatar initials from a display name. "?" when name is missing.
export function initials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

// Price split into a currency label + amount so the card can style the
// currency smaller (the prototype's `.ccy` span). 0 = free.
export function priceParts(
  currency: Currency,
  minor: number
): { ccy: string | null; amount: string } {
  if (minor === 0) return { ccy: null, amount: 'Free' };
  const major = minor / 100;
  const amount = Number.isInteger(major)
    ? major.toLocaleString('en-US')
    : major.toFixed(2);
  return { ccy: currency === 'GHS' ? 'GHS' : '$', amount };
}

// "May 27" from an ISO date string, parsed as a calendar date (no TZ
// shift — the DB column is a DATE).
export function formatCohortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// The "when" line on a card: self-paced starts anytime; tutor-led shows
// the next upcoming cohort, or "In progress" when only a late-join
// cohort is open.
export function whenLabel(p: PublicProgramme): { k: string; v: string } {
  if (p.delivery_mode === 'SELF_PACED') return { k: 'Start', v: 'Anytime' };
  if (p.next_cohort_start) {
    return { k: 'Next cohort', v: formatCohortDate(p.next_cohort_start) };
  }
  return { k: 'Cohort', v: 'In progress' };
}

// "8 weeks" / "6 modules" from length + unit label.
export function lengthLabel(lengthUnits: number, unitLabel: UnitLabel): string {
  const noun = unitLabel === 'WEEK' ? 'week' : 'module';
  return `${lengthUnits} ${noun}${lengthUnits === 1 ? '' : 's'}`;
}

// Access window for the meta strip. NULL = lifetime; whole months shown
// as months, otherwise days.
export function accessWindowLabel(days: number | null): string {
  if (days == null) return 'Lifetime';
  if (days % 30 === 0) {
    const months = days / 30;
    return `${months} month${months === 1 ? '' : 's'}`;
  }
  return `${days} day${days === 1 ? '' : 's'}`;
}

// Longer date for the cohort rows, e.g. "May 27, 2026".
export function formatCohortDateLong(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Derived cohort status for a public cohort row (ended ones are already
// filtered out by the query).
export function cohortStatus(c: PublicCohort): { label: string; tone: 'soon' | 'live' } {
  const today = new Date().toISOString().slice(0, 10);
  if (c.start_date > today) return { label: 'Upcoming', tone: 'soon' };
  return {
    label: c.allow_late_join ? 'In progress · late-join open' : 'In progress',
    tone: 'live',
  };
}
