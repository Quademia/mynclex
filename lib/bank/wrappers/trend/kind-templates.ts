// mynclex/lib/bank/wrappers/trend/kind-templates.ts
//
// Hardcoded registry of the 5 built-in kind presets for trend
// datasets. `kind` is just a short display label on the dataset row —
// the stimulus itself is built from the chart tabs. The old flat-grid
// row/timepoint seeds were retired with the flat grid (Slice 4); only
// `kind` persists on the DB row.

// The 5 machine-name keys. `kind` on the DB is freeform TEXT, so
// anything other than these is treated as "custom" at the UI layer.
export const KIND_PRESETS = [
  'vitals',
  'labs',
  'io',
  'neuro',
  'assessment',
] as const;

export type KindPreset = (typeof KIND_PRESETS)[number];

// Curator-facing label for each kind. Presets render their friendly
// label; custom kinds render the curator-typed string verbatim
// (decision: the typed string IS the label — picking Custom and
// typing "doctor notes" should show "doctor notes" everywhere, not
// be flattened to a generic "Custom" badge).
//
// Empty / literal 'custom' fall back to "Custom" — defensive for
// legacy rows or any path that bypasses the picker's required-name
// gate.
export function kindDefaultLabel(kind: string): string {
  switch (kind) {
    case 'vitals':     return 'Vitals';
    case 'labs':       return 'Labs';
    case 'io':         return 'Intake & Output';
    case 'neuro':      return 'Neuro';
    case 'assessment': return 'Assessment';
    default:           return kind && kind !== 'custom' ? kind : 'Custom';
  }
}

export function isKindPreset(kind: string): kind is KindPreset {
  return (KIND_PRESETS as readonly string[]).includes(kind);
}
