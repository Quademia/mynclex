// mynclex/lib/discovery/format.ts
//
// Display helpers for the public discovery surfaces. Single-currency
// per programme (Slice 3a) — the tutor's configured currency, shown
// as-is. An FX "≈ equivalent" hint is deferred polish.

import type { Currency, UnitLabel } from '@/lib/programmes/types';
import type { PublicProgramme, PublicCohort, PublicProfile } from './types';

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
// the next upcoming cohort, "In progress" when only a late-join cohort is
// open, or "Not scheduled yet" when there's no open cohort at all (still
// discoverable → express interest on the detail page).
export function whenLabel(p: PublicProgramme): { k: string; v: string } {
  if (p.delivery_mode === 'SELF_PACED') return { k: 'Start', v: 'Anytime' };
  if (p.next_cohort_start) {
    return { k: 'Next cohort', v: formatCohortDate(p.next_cohort_start) };
  }
  // An open cohort with no future start = a late-join run already underway.
  if (p.open_cohort_count > 0) return { k: 'Cohort', v: 'In progress' };
  // No open cohort at all — discoverable, but you express interest rather
  // than join now.
  return { k: 'Next cohort', v: 'Not scheduled yet' };
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

// "6 years tutoring" from the optional years_experience field. Null
// when unset or non-positive (so callers can omit the line entirely).
export function yearsTutoringLabel(years: number | null | undefined): string | null {
  if (years == null || !Number.isFinite(years) || years <= 0) return null;
  return `${years} year${years === 1 ? '' : 's'} tutoring`;
}

// Who to attribute a programme to — the single place the "show person
// AND business together" rule lives (slice 3.5). No mode switch: a
// filled business_name means the business is the primary name and the
// person is shown alongside; otherwise the person is primary.
//
// `imageUrl` is the business logo (business mode) or the person's
// avatar; when null the caller falls back to initials of `initialsSeed`.
export type TutorAttribution = {
  isBusiness: boolean;
  primaryName: string;        // headline name (business or person)
  secondaryName: string | null; // person shown alongside, business mode only
  imageUrl: string | null;
  initialsSeed: string | null;
};

export function tutorAttribution(
  profile: PublicProfile | null,
  tutorName: string | null,
  avatarUrl: string | null
): TutorAttribution {
  const business = (profile?.business_name ?? '').trim();
  const isBusiness = business.length > 0;
  const person = (tutorName ?? '').trim() || null;
  const logo = (profile?.business_logo_url ?? '').trim() || null;

  return {
    isBusiness,
    primaryName: isBusiness ? business : (person ?? 'A MyNclex tutor'),
    secondaryName: isBusiness ? person : null,
    imageUrl: isBusiness ? logo : (avatarUrl ?? null),
    initialsSeed: isBusiness ? business : person,
  };
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
