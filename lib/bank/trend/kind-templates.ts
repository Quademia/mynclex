// mynclex/lib/bank/trend/kind-templates.ts
//
// Hardcoded registry of the 5 built-in kind presets for trend
// datasets (Slice 1.12a). Picking a preset at creation seeds the
// starting rows (and enables the ref-range column for Labs).
// Everything seeded is editable afterwards — the template is pure UI
// sugar. Only `kind` persists on the DB row.
//
// Why hardcoded (not a DB lookup table):
//   - Each preset needs code-level defaults (row metrics, ref_ranges,
//     the ref-range-enabled flag). A DB registry without code buys
//     nothing since the editor has to render these anyway.
//   - The set is small and stable. Promote to DB later if curators
//     start asking for new presets without a deploy.
//
// Custom is NOT in the registry — it's the "unknown kind" branch in
// every helper below. Curators pick "Custom" in the UI, type a
// freeform kind string, and get empty seed data.

import type { TrendRow } from './types';

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

// Curator-facing label for each kind. "Custom" is the fallback for
// any kind string that's not a preset — the editor shows this next
// to the kind picker so the curator recognises what's loaded.
export function kindDefaultLabel(kind: string): string {
  switch (kind) {
    case 'vitals':     return 'Vitals';
    case 'labs':       return 'Labs';
    case 'io':         return 'Intake & Output';
    case 'neuro':      return 'Neuro';
    case 'assessment': return 'Assessment';
    default:           return 'Custom';
  }
}

// Whether the ref-range column should default ON for a given kind.
// Only Labs turns it on; the curator can still toggle it per dataset.
export function kindEnablesRefRange(kind: string): boolean {
  return kind === 'labs';
}

// ─────────────────────────────────────────────────────────────
// Seed tables per preset. Every row starts with empty `values` +
// `flags` arrays (filled in per scenario) but carries a realistic
// `metric` label. Timepoints stay empty across all presets —
// curator fills them in per scenario (morning/evening, 0800/0900,
// Mon/Tue/Wed, etc.).
// ─────────────────────────────────────────────────────────────

type Seed = { timepoints: string[]; rows: TrendRow[] };

const VITALS_SEED: Seed = {
  timepoints: [],
  rows: [
    { metric: 'BP',   values: [], flags: [] },
    { metric: 'HR',   values: [], flags: [] },
    { metric: 'RR',   values: [], flags: [] },
    { metric: 'SpO₂', values: [], flags: [] },
    { metric: 'Temp', values: [], flags: [] },
  ],
};

const LABS_SEED: Seed = {
  timepoints: [],
  rows: [
    { metric: 'Na⁺ (mmol/L)',    values: [], flags: [], ref_range: '135–145' },
    { metric: 'K⁺ (mmol/L)',     values: [], flags: [], ref_range: '3.5–5.0' },
    { metric: 'Creatinine',       values: [], flags: [], ref_range: '<1.3 mg/dL' },
    { metric: 'BUN',              values: [], flags: [], ref_range: '7–20 mg/dL' },
  ],
};

const IO_SEED: Seed = {
  timepoints: [],
  rows: [
    { metric: 'IV intake',    values: [], flags: [] },
    { metric: 'PO intake',    values: [], flags: [] },
    { metric: 'Urine output', values: [], flags: [] },
    { metric: 'Net balance',  values: [], flags: [] },
  ],
};

const NEURO_SEED: Seed = {
  timepoints: [],
  rows: [
    { metric: 'GCS',            values: [], flags: [] },
    { metric: 'Pupils',         values: [], flags: [] },
    { metric: 'Orientation',    values: [], flags: [] },
    { metric: 'Motor strength', values: [], flags: [] },
  ],
};

const ASSESSMENT_SEED: Seed = {
  // Generic starting point — curator builds rows + timepoints from
  // scratch. Intentionally empty on both axes.
  timepoints: [],
  rows: [],
};

const CUSTOM_SEED: Seed = {
  timepoints: [],
  rows: [],
};

export function kindSeedData(kind: string): Seed {
  switch (kind) {
    case 'vitals':     return VITALS_SEED;
    case 'labs':       return LABS_SEED;
    case 'io':         return IO_SEED;
    case 'neuro':      return NEURO_SEED;
    case 'assessment': return ASSESSMENT_SEED;
    default:           return CUSTOM_SEED;
  }
}

export function isKindPreset(kind: string): kind is KindPreset {
  return (KIND_PRESETS as readonly string[]).includes(kind);
}
