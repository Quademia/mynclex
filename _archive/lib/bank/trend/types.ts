// mynclex/lib/bank/trend/types.ts
//
// Shared type shapes for the Trend dataset editor + actions + list
// page (Slice 1.12a). Trend-specific so lib/bank/types.ts stays
// focused on item shapes.
//
// Slice 1.12b: TrendEditorInitial now carries `attachedItems` —
// the full bank-item rows linked via `trend_id`. Child drafts for
// the authoring pane derive from these via `loadChildDraft` in
// `./child-draft.ts`.

import type { FullBankRow } from '../list-view';

// Surface discriminator. Duplicated from the bank actions file rather
// than imported so this module stays standalone (the bank module
// doesn't export it publicly). Same convention as case-study/types.ts.
export type Surface = 'admin' | 'tutor';

// Per-cell flag. null = no flag. `'abnormal'` / `'borderline'` are the
// two tones the authoring UI lets the curator set. These are
// author-side only — the student runner does NOT render them on the
// pre-submit view (but the student runner is a separate track).
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
export interface TrendDatasetRow {
  trend_id:     string;
  tutor_id?:    string | null;
  title:        string;
  scenario:     string | null;
  kind:         string;
  timepoints:   string[];
  rows:         TrendRow[];
  is_published: boolean;
  created_at:   string;
  updated_at:   string;
}

// Convenience bundle for the editor page: the dataset row + its
// attached bank-item rows. `attachedItems` is always sorted by
// `created_at ASC` so pill order is stable across reloads.
// Extended in Slice 1.12b from the 1.12a shape (dataset only).
export interface TrendEditorInitial {
  datasetRow:    TrendDatasetRow;
  attachedItems: FullBankRow[];
}

// Re-export for ergonomic imports from editor components.
export type { TrendChildDraft } from './child-draft';

// Slice 1.12c — re-export the validator's snapshot shape so the
// editor can import a single barrel (`./types`) for both the RPC-
// facing types and the validator-facing state.
export type {
  TrendEditorState,
  TrendEditorChildSnapshot,
  ValidationIssue,
  Severity,
  PanelSummary,
  PanelSummaryKind,
} from './validation';
