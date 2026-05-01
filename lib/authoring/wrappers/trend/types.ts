// mynclex/lib/authoring/wrappers/trend/types.ts
//
// Type shapes for the trend wrapper-v2 build (slice 13). 13a uses
// only TrendDatasetRow + TrendRow; the wrapper-page shapes
// (WrapperData, SlotRow) get added in 13b's loader.
//
// Vendored from lib/bank/trend/types.ts per slice 13's vendoring
// rule (active until slice 14). Includes the two new visibility
// flag columns added in the slice-13 migration (decision 16):
// is_free_sample + is_builder_visible. Defaults match
// nclex_bank_items: FALSE / TRUE.

// Surface discriminator. Same convention as case-study/types.ts.
export type Surface = 'admin' | 'tutor';

// Per-cell flag. null = no flag. `'abnormal'` / `'borderline'` are
// the two tones the authoring UI lets the curator set. Author-side
// only — the student runner does NOT render flags on the pre-submit
// view.
export type TrendFlag = 'abnormal' | 'borderline' | null;

// One row in a trend dataset. `values` and `flags` are aligned with
// the parent dataset's `timepoints` array (same length — index i of
// each three lines up). `ref_range` is optional per row; the column
// renders if any row in the dataset has one set.
export interface TrendRow {
  metric:     string;
  values:     string[];
  flags:      TrendFlag[];
  ref_range?: string;
}

// Full DB row shape for nclex_trend_datasets / nclex_tutor_trend_datasets.
// tutor_id is present only on tutor rows; admin rows keep it null in
// the TS shape even though the column doesn't exist on the admin
// table — keeps both surfaces fieldable with one interface.
//
// is_free_sample + is_builder_visible were added in the slice-13
// migration. Defaults: FALSE / TRUE.
export interface TrendDatasetRow {
  trend_id:           string;
  tutor_id?:          string | null;
  title:              string;
  scenario:           string | null;
  kind:               string;
  timepoints:         string[];
  rows:               TrendRow[];
  is_published:       boolean;
  is_free_sample:     boolean;
  is_builder_visible: boolean;
  created_at:         string;
  updated_at:         string;
}
