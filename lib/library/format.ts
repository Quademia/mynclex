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
