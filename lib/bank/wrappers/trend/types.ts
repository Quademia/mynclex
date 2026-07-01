// mynclex/lib/bank/wrappers/trend/types.ts
//
// Type shapes for the trend wrapper. TrendDatasetRow + TrendRow
// model the dataset row + its data rows; WrapperData + SlotRow +
// SlotEditorInitial model the wrapper-page bundle.
//
// is_free_sample + is_builder_visible defaults match nclex_bank_items:
// FALSE / TRUE.

import type { MergeTabData }    from '@/lib/authoring/table/merge-table-model';
import type { NarrativeTabData } from '@/lib/authoring/narrative/narrative-model';
import type { McqEditorInitial }      from '../../editors/mcq-row-mapper';
import type { TfEditorInitial }       from '../../editors/tf-row-mapper';
import type { SataEditorInitial }     from '../../editors/sata-row-mapper';
import type { SelectNEditorInitial }  from '../../editors/select-n-row-mapper';
import type { MatrixEditorInitial }   from '../../editors/matrix-row-mapper';
import type { MatrixMrEditorInitial } from '../../editors/matrix-mr-row-mapper';
import type { BowtieEditorInitial }   from '../../editors/bowtie-row-mapper';
import type { ClozeEditorInitial }    from '../../editors/cloze-row-mapper';
import type { HighlightEditorInitial } from '../../editors/highlight-row-mapper';
import type { DragDropEditorInitial } from '../../editors/drag-drop-row-mapper';
import type { DragClozeEditorInitial } from '../../editors/drag-cloze-row-mapper';
import type { DragOrderEditorInitial } from '../../editors/drag-order-row-mapper';

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
  row_label:          string | null;
  timepoints:         string[];
  rows:               TrendRow[];
  is_published:       boolean;
  is_free_sample:     boolean;
  is_builder_visible: boolean;
  created_at:         string;
  updated_at:         string;
}

// ───────────────────────────────────────────────────────────────
// Chart-tab shapes (trend rich multi-chart, Slice 1)
// ───────────────────────────────────────────────────────────────

// Column definition carried on custom_grid tabs. Trend owns its own
// copy (wrappers stay independent — never imports case-study types).
export interface TrendTabColumn {
  id:    string;
  label: string;
}

// One nclex_trend_tabs / nclex_tutor_trend_tabs row. Mirrors the case
// study TabRow, minus the v1 ChartEntry shape — trend is a fresh v2-only
// build, so `entries` is always a rich v2 blob (a merge-table list or a
// narrative). Unlike case study, there is no progressive disclosure:
// entries carry no meaningful visible_from and every tab renders at once.
export interface TrendTabRow {
  tab_id:        string;
  trend_id:      string;
  tab_key:       string;
  title:         string;
  display_order: number;
  is_custom:     boolean;
  custom_shape:  'free_text' | 'rows_cols' | null;
  columns_def:   TrendTabColumn[];
  entries:       MergeTabData | NarrativeTabData;
}

// ───────────────────────────────────────────────────────────────
// Wrapper-page shapes (13b)
// ───────────────────────────────────────────────────────────────

// Discriminated union of every editor's initial shape. A populated
// slot carries one of these as its `editor`. Trend has no empty-slot
// concept (variable N — empty == "no slots"), so `editor` is always
// non-null per slot.
export type SlotEditorInitial =
  | { kind: 'MCQ';        initial: McqEditorInitial       }
  | { kind: 'TF';         initial: TfEditorInitial        }
  | { kind: 'SATA';       initial: SataEditorInitial      }
  | { kind: 'SELECT_N';   initial: SelectNEditorInitial   }
  | { kind: 'MATRIX';     initial: MatrixEditorInitial    }
  | { kind: 'MATRIX_MR';  initial: MatrixMrEditorInitial  }
  | { kind: 'BOWTIE';     initial: BowtieEditorInitial    }
  | { kind: 'CLOZE';      initial: ClozeEditorInitial     }
  | { kind: 'HIGHLIGHT';  initial: HighlightEditorInitial }
  | { kind: 'DRAG_DROP';  initial: DragDropEditorInitial  }
  | { kind: 'DRAG_CLOZE'; initial: DragClozeEditorInitial }
  | { kind: 'DRAG_ORDER'; initial: DragOrderEditorInitial };

// One attached question on a trend dataset. Position is a 1-based
// display index derived from creation order — there's no `position`
// column on the DB. Per decision 11, each question carries its own
// three visibility flags (genuinely owned, not force-cleared by the
// editor — contrast with CS).
export interface SlotRow {
  position:           number;            // 1-based display index
  item_id:            string;
  question_type:      string;            // 'MCQ' | 'SATA' | …
  stem:               string;
  editor:             SlotEditorInitial;
  is_published:       boolean;
  is_free_sample:     boolean;
  is_builder_visible: boolean;
}

// Bundle the wrapper page renders against.
export interface WrapperData {
  surface:    Surface;
  datasetRow: TrendDatasetRow;
  slots:      SlotRow[];                 // variable length, ordered by created_at ASC
  tabs:       TrendTabRow[];             // chart tabs, ordered by display_order ASC
}
