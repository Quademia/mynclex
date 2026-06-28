// mynclex/lib/bank/wrappers/case-study/types.ts
//
// Wrapper-page row shapes for the case-study editor.

import type { CjmmStep } from '../../classifications';
import type { MergeTabData } from '@/lib/authoring/table/merge-table-model';
import type { NarrativeTabData } from '@/lib/authoring/narrative/narrative-model';
import type { McqEditorInitial }      from '../../editors/mcq-row-mapper';
import type { TfEditorInitial }       from '../../editors/tf-row-mapper';
import type { SataEditorInitial }     from '../../editors/sata-row-mapper';
import type { SelectNEditorInitial }  from '../../editors/select-n-row-mapper';
import type { MatrixEditorInitial }   from '../../editors/matrix-row-mapper';
import type { BowtieEditorInitial }   from '../../editors/bowtie-row-mapper';
import type { ClozeEditorInitial }    from '../../editors/cloze-row-mapper';
import type { HighlightEditorInitial } from '../../editors/highlight-row-mapper';
import type { DragDropEditorInitial } from '../../editors/drag-drop-row-mapper';

// Discriminated union of every editor's initial shape. A populated
// slot carries one of these as its `initial`; an empty slot's
// initial is null. The 'wrapper-child' housekeeping mode is set
// inside the row mapper dispatch in load-case.ts.
export type SlotEditorInitial =
  | { kind: 'MCQ';        initial: McqEditorInitial       }
  | { kind: 'TF';         initial: TfEditorInitial        }
  | { kind: 'SATA';       initial: SataEditorInitial      }
  | { kind: 'SELECT_N';   initial: SelectNEditorInitial   }
  | { kind: 'MATRIX';     initial: MatrixEditorInitial    }
  | { kind: 'BOWTIE';     initial: BowtieEditorInitial    }
  | { kind: 'CLOZE';      initial: ClozeEditorInitial     }
  | { kind: 'HIGHLIGHT';  initial: HighlightEditorInitial }
  | { kind: 'DRAG_DROP';  initial: DragDropEditorInitial  };

export type Surface = 'admin' | 'tutor';

// nclex_case_studies / nclex_tutor_case_studies row shape used by
// the wrapper page. is_published is plumbed through but the
// publish gate fires only when set true via Save case study (slice 12c).
export interface CaseRow {
  case_id:                   string;
  tutor_id?:                 string | null;
  title:                     string;
  scenario_summary:          string | null;

  // Classifications retained on the DB row but NOT surfaced in UI
  // (decision 9.2 — they live on questions only). Loaded for
  // legacy-edit fallback only.
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

// Column definition carried on custom_grid tabs.
export interface TabColumn {
  id:    string;
  label: string;
}

// Entry on a chart tab — one row of structured data or one
// narrative card. visible_from (1-6) is always set; other fields
// vary by tab shape.
export interface ChartEntry {
  visible_from: number;
  [field: string]: string | number | null | undefined;
}

// nclex_case_study_tabs row.
//
// `entries` is normally a ChartEntry[] (built-in + v1 custom tabs). A v2
// custom table (rich-content relook) stores a MergeTabData object here
// instead (a list of tables) — the editor branches on the shape. See
// asMergeTab() in lib/authoring/table/merge-table-model.
export interface TabRow {
  tab_id:        string;
  case_id:       string;
  tab_key:       string;
  title:         string;
  display_order: number;
  is_custom:     boolean;
  custom_shape:  'free_text' | 'rows_cols' | null;
  columns_def:   TabColumn[];
  entries:       ChartEntry[] | MergeTabData | NarrativeTabData;
}

// One of the six slots on a case. position is fixed 1-6 (schema
// CHECK + UNIQUE constraints). An empty slot has item_id = null.
export interface SlotRow {
  position:  number;                // 1-6
  item_id:   string | null;
  cjmm_step: CjmmStep | null;

  // Hydrated from the linked nclex_bank_items (admin) /
  // nclex_tutor_questions (tutor) row when item_id is non-null.
  // - question_type + stem are kept on the slot for cheap rendering
  //   in the slot rail / slot strip (no need to crack open `editor`
  //   just to show the chip + preview text).
  // - editor is the discriminated initial shape ready to feed the
  //   matching <XxxEditorBody>. Slice 12c-3 mounts it in editor mode.
  question_type: string | null;     // 'MCQ' | 'SATA' | … | null
  stem:          string | null;
  editor:        SlotEditorInitial | null;
}

// Bundle the wrapper page renders against. Always 6 slot rows
// (positions 1-6, with empty positions filled in by the loader).
export interface WrapperData {
  surface:  Surface;
  caseRow:  CaseRow;
  tabs:     TabRow[];   // sorted by display_order
  slots:    SlotRow[];  // length 6, sorted by position 1..6
}

// ───────────────────────────────────────────────────────────
// CaseStudy-prefixed type aliases used by the chart-tab components
// (alternative names for the same shapes, kept for readability at
// call sites).
// ───────────────────────────────────────────────────────────

export type CaseStudyTabRow    = TabRow;
export type CaseStudyEntry     = ChartEntry;
export type CaseStudyTabColumn = TabColumn;

// visible_from bounds — 1..6 maps to the 6 question positions.
export const VF_MIN = 1;
export const VF_MAX = 6;
export const VF_DEFAULT = 1;

// custom_grid columns: 2..10 (mirrors legacy bounds).
export const CUSTOM_GRID_MIN_COLUMNS = 2;
export const CUSTOM_GRID_MAX_COLUMNS = 10;
