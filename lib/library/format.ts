// mynclex/lib/library/format.ts
//
// Small display helpers for the tutor library. Slice 11.2b
// introduces pillar-name shortening (long NCSBN names don't fit
// in a chip otherwise).
//
// The CD prototype uses the same short forms; we mirror those so
// the in-app chip vocabulary matches the design system.

import type { NclexPillar } from './types';

/**
 * Short form of an NCLEX-RN Client Needs sub-category, suitable
 * for a chip label. Lossless w.r.t. the full name's meaning — the
 * tooltip on the chip surfaces the canonical full name so the
 * tutor can still see exactly what classification they picked.
 */
export function pillarShortName(name: NclexPillar): string {
  switch (name) {
    case 'Management of Care':
      return 'Mgmt of Care';
    case 'Safety and Infection Control':
      return 'Safety/Infection';
    case 'Health Promotion and Maintenance':
      return 'Health Promotion';
    case 'Psychosocial Integrity':
      return 'Psychosocial';
    case 'Basic Care and Comfort':
      return 'Basic Care';
    case 'Pharmacological and Parenteral Therapies':
      return 'Pharm/Parenteral';
    case 'Reduction of Risk Potential':
      return 'Risk Reduction';
    case 'Physiological Adaptation':
      return 'Physiological';
  }
}

/**
 * The first non-empty value among description / subtitle, used as
 * the fallback line on the per-folder notes list when title alone
 * doesn't carry the row. Returns null if both are empty — the row
 * just omits the line in that case.
 */
export function lensRowFallback(
  description: string | null,
  subtitle: string | null,
): string | null {
  if (description && description.trim().length > 0) return description.trim();
  if (subtitle && subtitle.trim().length > 0) return subtitle.trim();
  return null;
}

/**
 * Relative-time formatter — "just now", "12s ago", "3m ago",
 * "yesterday", or absolute date for >7 days. Used by the lens row's
 * "edited X ago" column and by the note editor's save badge.
 *
 * Hoisted from note-editor.tsx during the 11.4 follow-on slice so
 * the shared `<NoteLensRow>` component can reach it without
 * importing from a sibling component file.
 */
export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const now = Date.now();
  const diffMs = now - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
