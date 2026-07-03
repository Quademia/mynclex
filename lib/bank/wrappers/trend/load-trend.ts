// mynclex/lib/bank/wrappers/trend/load-trend.ts
//
// Server-side loader for the trend wrapper page (13b). One render
// call: dataset row + attached question rows fed through each type's
// row mapper to produce editor-ready initial shapes.
//
// Surface-aware:
//   - admin → nclex_trend_datasets + nclex_bank_items where trend_id matches
//   - tutor → nclex_tutor_trend_datasets + nclex_tutor_questions where trend_id matches
//
// Returns null if the dataset doesn't exist (or the tutor doesn't own
// it — RLS returns zero rows). Route page calls notFound() on null.
//
// Departs from CS's load-case in two ways:
//   - No join table — the link is one column on the question row.
//   - Variable N attached questions — slots come back sorted by
//     created_at ASC for stable pill order.
//
// Per decision 12, attached questions mount in `'standalone'` mode
// (questions own their flags genuinely), so no mode override on the
// returned initials — the row mappers' default 'standalone' is correct.

import type { ServerSupabaseClient } from '@/lib/access';
import type {
  SlotEditorInitial,
  SlotRow,
  Surface,
  TrendDatasetRow,
  TrendTabRow,
  WrapperData,
} from './types';

import {
  type McqDbRow,
  MCQ_ROW_COLUMNS,
  mcqRowToInitial,
} from '../../editors/mcq-row-mapper';
import { tfRowToInitial }     from '../../editors/tf-row-mapper';
import {
  type SataDbRow,
  sataRowToInitial,
} from '../../editors/sata-row-mapper';
import {
  type SelectNDbRow,
  selectNRowToInitial,
} from '../../editors/select-n-row-mapper';
import {
  type MatrixDbRow,
  matrixRowToInitial,
} from '../../editors/matrix-row-mapper';
import {
  type MatrixMrDbRow,
  matrixMrRowToInitial,
} from '../../editors/matrix-mr-row-mapper';
import {
  type BowtieDbRow,
  bowtieRowToInitial,
} from '../../editors/bowtie-row-mapper';
import {
  type ClozeDbRow,
  clozeRowToInitial,
} from '../../editors/cloze-row-mapper';
import {
  type HighlightDbRow,
  highlightRowToInitial,
} from '../../editors/highlight-row-mapper';
import {
  type DragClozeDbRow,
  dragClozeRowToInitial,
} from '../../editors/drag-cloze-row-mapper';
import {
  type DragOrderDbRow,
  dragOrderRowToInitial,
} from '../../editors/drag-order-row-mapper';

interface SurfaceConfig {
  datasetTable:  'nclex_trend_datasets' | 'nclex_tutor_trend_datasets';
  questionTable: 'nclex_bank_items' | 'nclex_tutor_questions';
  tabTable:      'nclex_trend_tabs' | 'nclex_tutor_trend_tabs';
}

function configFor(surface: Surface): SurfaceConfig {
  if (surface === 'tutor') {
    return {
      datasetTable:  'nclex_tutor_trend_datasets',
      questionTable: 'nclex_tutor_questions',
      tabTable:      'nclex_tutor_trend_tabs',
    };
  }
  return {
    datasetTable:  'nclex_trend_datasets',
    questionTable: 'nclex_bank_items',
    tabTable:      'nclex_trend_tabs',
  };
}

const DATASET_COLUMNS =
  'trend_id, title, scenario, tags, ' +
  'is_published, is_free_sample, is_builder_visible, ' +
  'created_at, updated_at';

const TUTOR_DATASET_COLUMNS = DATASET_COLUMNS + ', tutor_id';

const TAB_COLUMNS =
  'tab_id, trend_id, tab_key, title, display_order, ' +
  'is_custom, custom_shape, columns_def, entries';

// ─────────────────────────────────────────────────────────────
// Row-mapper dispatch — converts a bank-item row to the matching
// editor's initial shape. Trend uses 'standalone' mode (decision 12)
// so we don't override the mappers' default mode.
// ─────────────────────────────────────────────────────────────

function rowToSlotEditor(
  row:     unknown,
  surface: Surface,
): SlotEditorInitial | null {
  const r = row as { question_type?: string };
  const sf = surface;
  switch (r.question_type) {
    case 'MCQ':
      return { kind: 'MCQ', initial: mcqRowToInitial(row as McqDbRow, sf) };
    case 'TF':
      return { kind: 'TF', initial: tfRowToInitial(row as McqDbRow, sf) };
    case 'SATA':
      return { kind: 'SATA', initial: sataRowToInitial(row as SataDbRow, sf) };
    case 'SELECT_N':
      return { kind: 'SELECT_N', initial: selectNRowToInitial(row as SelectNDbRow, sf) };
    case 'MATRIX':
      return { kind: 'MATRIX', initial: matrixRowToInitial(row as MatrixDbRow, sf) };
    case 'MATRIX_MR':
      return { kind: 'MATRIX_MR', initial: matrixMrRowToInitial(row as MatrixMrDbRow, sf) };
    case 'BOWTIE':
      return { kind: 'BOWTIE', initial: bowtieRowToInitial(row as BowtieDbRow, sf) };
    case 'CLOZE':
      return { kind: 'CLOZE', initial: clozeRowToInitial(row as ClozeDbRow, sf) };
    case 'HIGHLIGHT':
      return { kind: 'HIGHLIGHT', initial: highlightRowToInitial(row as HighlightDbRow, sf) };
    case 'DRAG_CLOZE':
      return { kind: 'DRAG_CLOZE', initial: dragClozeRowToInitial(row as DragClozeDbRow, sf) };
    case 'DRAG_ORDER':
      return { kind: 'DRAG_ORDER', initial: dragOrderRowToInitial(row as DragOrderDbRow, sf) };
    default:
      return null;
  }
}

export async function loadTrend(
  supabase: ServerSupabaseClient,
  surface:  Surface,
  trend_id: string,
): Promise<WrapperData | null> {
  const cfg = configFor(surface);

  const { data: datasetData, error: datasetErr } = await supabase
    .from(cfg.datasetTable)
    .select(surface === 'tutor' ? TUTOR_DATASET_COLUMNS : DATASET_COLUMNS)
    .eq('trend_id', trend_id)
    .maybeSingle();

  if (datasetErr) throw datasetErr;
  if (!datasetData) return null;

  const datasetRow = datasetData as unknown as TrendDatasetRow;

  // Attached questions — fetch FULL bank rows so each row mapper has
  // everything it needs. All 9 types share MCQ_ROW_COLUMNS; the
  // JSONB content / correct interpretation differs but the column set
  // is identical. Order by created_at ASC for stable pill order.
  const { data: qData, error: qErr } = await supabase
    .from(cfg.questionTable)
    .select(MCQ_ROW_COLUMNS)
    .eq('trend_id', trend_id)
    .order('created_at', { ascending: true });

  if (qErr) throw qErr;

  // Chart tabs — the rich multi-chart stimulus (Slice 1 loads them;
  // nothing renders them until Slice 2). Ordered by display_order for
  // stable rail order. RLS gates by dataset ownership / publish state.
  const { data: tabData, error: tabErr } = await supabase
    .from(cfg.tabTable)
    .select(TAB_COLUMNS)
    .eq('trend_id', trend_id)
    .order('display_order', { ascending: true });

  if (tabErr) throw tabErr;

  const tabs = (tabData ?? []) as unknown as TrendTabRow[];

  const qRows = (qData ?? []) as unknown as Array<Record<string, unknown>>;

  const slots: SlotRow[] = [];
  qRows.forEach((q, idx) => {
    const editor = rowToSlotEditor(q, surface);
    if (!editor) return;  // Unknown question_type — skip rather than crash
    slots.push({
      position:           idx + 1,
      item_id:            q.item_id as string,
      question_type:      q.question_type as string,
      stem:               (q.stem as string) ?? '',
      editor,
      is_published:       (q.is_published as boolean) ?? false,
      is_free_sample:     (q.is_free_sample as boolean) ?? false,
      is_builder_visible: (q.is_builder_visible as boolean) ?? true,
    });
  });

  return { surface, datasetRow, slots, tabs };
}
