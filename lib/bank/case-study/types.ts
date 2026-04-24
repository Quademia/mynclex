// mynclex/lib/bank/case-study/types.ts
//
// Shared type shapes for the case-study editor + actions + list page
// (Slice 1.11a). Case-study-specific so lib/bank/types.ts stays focused
// on bank-item shapes.

import type { CustomShape } from './tab-types';
import type { CjmmStep } from '../classifications';
import type { BankFormInitial } from '../form-shape';

// Surface discriminator. Duplicated from the bank actions file rather
// than imported so this module stays standalone (the bank module
// doesn't export it publicly).
export type Surface = 'admin' | 'tutor';

// Row shape for nclex_case_studies / nclex_tutor_case_studies.
// Post-Slice-1.11a: the 6 hardcoded JSONB tab columns are gone —
// tabs live in nclex_case_study_tabs (and the tutor twin). The fields
// here are exactly what remains on the parent case row.
export interface CaseStudyRow {
  case_id:                   string;
  tutor_id?:                 string | null;        // present only on tutor rows
  title:                     string;
  scenario_summary:          string | null;

  client_needs_category:     string | null;
  client_needs_subcategory:  string | null;
  nursing_subject:           string | null;
  body_system:               string | null;
  topic:                     string | null;
  subtopic:                  string | null;
  difficulty:                'Easy' | 'Medium' | 'Hard' | null;
  tags:                      string[];

  is_free_sample:            boolean;
  is_builder_visible:        boolean;
  is_published:              boolean;

  created_at:                string;
  updated_at:                string;
}

// Column definition carried on custom_grid tabs (built-in structured
// tabs get their columns from the tab-types.ts registry instead).
export interface CaseStudyTabColumn {
  id:    string;
  label: string;
}

// One entry in a tab's `entries` JSONB array. visible_from is always
// present (1-6). Other fields vary by tab shape:
//   - Built-in structured tabs: one key per registry column id
//     (e.g. time, bp, hr, rr, spo2, temp, pain for vital_signs).
//   - Built-in narrative tabs:  'time' (optional if omit_time), 'body',
//                                plus extra_fields (e.g. 'status',
//                                'section', 'test_type').
//   - Custom free_text tabs:    'time', 'body'.
//   - Custom rows_cols tabs:    one key per curator-defined column.
//
// Values are strings — curator enters them freely. visible_from is the
// one numeric field. Unknown keys are tolerated (forwards-compat).
export interface CaseStudyEntry {
  visible_from: number;
  [field: string]: string | number | null | undefined;
}

// Row shape for nclex_case_study_tabs / nclex_tutor_case_study_tabs.
export interface CaseStudyTabRow {
  tab_id:        string;
  case_id:       string;
  tab_key:       string;         // built-in key OR custom_narrative / custom_grid
  title:         string;
  display_order: number;
  is_custom:     boolean;
  custom_shape:  CustomShape | null;
  columns_def:   CaseStudyTabColumn[];
  entries:       CaseStudyEntry[];
  created_at:    string;
  updated_at:    string;
}

// One of the six question slots on a case study (Slice 1.11b).
// Position is fixed 1-6. An empty slot has item_id=null, cjmm_step=null,
// initial=null. A filled slot has all three set — initial is the
// BankFormInitial draft derived from the linked nclex_bank_items row
// via rowToInitial().
export interface CaseStudySlotRow {
  position:  number;                // 1-6
  item_id:   string | null;         // null until a child question is authored
  cjmm_step: CjmmStep | null;
  initial:   BankFormInitial | null;
}

// Convenience bundle for the editor page: the case + its tabs + its
// six slot drafts already joined. The editor's `initial` prop uses
// this shape. `slots` is always length 6, ordered by position ascending.
export interface CaseStudyEditorInitial {
  caseRow: CaseStudyRow;
  tabs:    CaseStudyTabRow[];
  slots:   CaseStudySlotRow[];
}

// visible_from bounds — 1..6 maps to the 6 question positions.
export const VF_MIN = 1;
export const VF_MAX = 6;
export const VF_DEFAULT = 1;

// Bounds for custom_grid columns (mockup §3.6 caption).
export const CUSTOM_GRID_MIN_COLUMNS = 2;
export const CUSTOM_GRID_MAX_COLUMNS = 10;
