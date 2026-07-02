// mynclex/lib/bank/wrappers/trend/kind-templates.ts
//
// `kind` is just a short display label on a trend dataset row — the
// stimulus itself is built from the chart tabs. The old flat-grid
// row/timepoint seeds (and the kind picker that chose them) were retired
// with the flat grid (Slice 4); a new trend now starts as 'custom' and
// the curator edits the label in the wrapper. This module keeps only the
// label helper — the runner/wrapper/list still render `kind` through it.

// Curator-facing label for a kind. The old preset keys still map to a
// friendly label (for any legacy rows); anything else renders verbatim,
// and empty / literal 'custom' falls back to "Custom".
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
