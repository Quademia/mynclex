// mynclex/lib/authoring/wrappers/case-study/load-case.ts
//
// Server-side loader for the case-study wrapper page. One render call:
// case row + chart tabs + slot join rows + the linked-question rows
// (full bank-item shape, fed through each type's row mapper to produce
// the editor-ready initial shape mounted in editor mode by slice 12c-3).
//
// Surface-aware:
//   - admin → nclex_case_studies + nclex_case_study_tabs +
//             nclex_case_study_items + nclex_bank_items
//   - tutor → nclex_tutor_case_studies + nclex_tutor_case_study_tabs +
//             nclex_tutor_case_study_items + nclex_tutor_questions
//
// Returns null if the case does not exist (or the tutor doesn't own
// it — RLS will return zero rows). The route page calls notFound()
// on null.

import type { ServerSupabaseClient } from '@/lib/access';
import type {
  CaseRow,
  ChartEntry,
  SlotEditorInitial,
  SlotRow,
  Surface,
  TabColumn,
  TabRow,
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
  type DragDropDbRow,
  dragDropRowToInitial,
} from '../../editors/drag-drop-row-mapper';

interface SurfaceConfig {
  caseTable:     'nclex_case_studies' | 'nclex_tutor_case_studies';
  tabTable:      'nclex_case_study_tabs' | 'nclex_tutor_case_study_tabs';
  itemsTable:    'nclex_case_study_items' | 'nclex_tutor_case_study_items';
  questionTable: 'nclex_bank_items' | 'nclex_tutor_questions';
}

function configFor(surface: Surface): SurfaceConfig {
  if (surface === 'tutor') {
    return {
      caseTable:     'nclex_tutor_case_studies',
      tabTable:      'nclex_tutor_case_study_tabs',
      itemsTable:    'nclex_tutor_case_study_items',
      questionTable: 'nclex_tutor_questions',
    };
  }
  return {
    caseTable:     'nclex_case_studies',
    tabTable:      'nclex_case_study_tabs',
    itemsTable:    'nclex_case_study_items',
    questionTable: 'nclex_bank_items',
  };
}

const CASE_COLUMNS =
  'case_id, title, scenario_summary, ' +
  'client_needs_category, client_needs_subcategory, nursing_subject, ' +
  'body_system, topic, subtopic, difficulty, tags, ' +
  'is_free_sample, is_builder_visible, is_published, ' +
  'created_at, updated_at';

const TUTOR_CASE_COLUMNS = CASE_COLUMNS + ', tutor_id';

const TAB_COLUMNS =
  'tab_id, case_id, tab_key, title, display_order, is_custom, ' +
  'custom_shape, columns_def, entries';

const ITEMS_COLUMNS = 'case_id, item_id, position, cjmm_step';

// ─────────────────────────────────────────────────────────────
// Row-mapper dispatch — converts a bank-item row to the matching
// editor's initial shape, then wraps in SlotEditorInitial. Sets
// mode='wrapper-child' inside each mapper call by overriding the
// returned initial's mode field (mappers default to 'standalone').
// ─────────────────────────────────────────────────────────────

function rowToSlotEditor(
  row:     unknown,
  surface: Surface,
): SlotEditorInitial | null {
  const r = row as { question_type?: string };
  const sf = surface;
  switch (r.question_type) {
    case 'MCQ':
      return { kind: 'MCQ', initial: { ...mcqRowToInitial(row as McqDbRow, sf), mode: 'wrapper-child' } };
    case 'TF':
      return { kind: 'TF', initial: { ...tfRowToInitial(row as McqDbRow, sf), mode: 'wrapper-child' } };
    case 'SATA':
      return { kind: 'SATA', initial: { ...sataRowToInitial(row as SataDbRow, sf), mode: 'wrapper-child' } };
    case 'SELECT_N':
      return { kind: 'SELECT_N', initial: { ...selectNRowToInitial(row as SelectNDbRow, sf), mode: 'wrapper-child' } };
    case 'MATRIX':
      return { kind: 'MATRIX', initial: { ...matrixRowToInitial(row as MatrixDbRow, sf), mode: 'wrapper-child' } };
    case 'BOWTIE':
      return { kind: 'BOWTIE', initial: { ...bowtieRowToInitial(row as BowtieDbRow, sf), mode: 'wrapper-child' } };
    case 'CLOZE':
      return { kind: 'CLOZE', initial: { ...clozeRowToInitial(row as ClozeDbRow, sf), mode: 'wrapper-child' } };
    case 'HIGHLIGHT':
      return { kind: 'HIGHLIGHT', initial: { ...highlightRowToInitial(row as HighlightDbRow, sf), mode: 'wrapper-child' } };
    case 'DRAG_DROP':
      return { kind: 'DRAG_DROP', initial: { ...dragDropRowToInitial(row as DragDropDbRow, sf), mode: 'wrapper-child' } };
    default:
      return null;
  }
}

export async function loadCase(
  supabase: ServerSupabaseClient,
  surface:  Surface,
  case_id:  string,
): Promise<WrapperData | null> {
  const cfg = configFor(surface);

  const { data: caseData, error: caseErr } = await supabase
    .from(cfg.caseTable)
    .select(surface === 'tutor' ? TUTOR_CASE_COLUMNS : CASE_COLUMNS)
    .eq('case_id', case_id)
    .maybeSingle();

  if (caseErr) throw caseErr;
  if (!caseData) return null;

  const caseRow = caseData as unknown as CaseRow;

  // Tabs + items in parallel.
  const [tabsResult, itemsResult] = await Promise.all([
    supabase
      .from(cfg.tabTable)
      .select(TAB_COLUMNS)
      .eq('case_id', case_id)
      .order('display_order', { ascending: true }),
    supabase
      .from(cfg.itemsTable)
      .select(ITEMS_COLUMNS)
      .eq('case_id', case_id),
  ]);

  if (tabsResult.error) throw tabsResult.error;
  if (itemsResult.error) throw itemsResult.error;

  const tabs: TabRow[] = (tabsResult.data ?? []).map((t) => ({
    tab_id:        t.tab_id as string,
    case_id:       t.case_id as string,
    tab_key:       t.tab_key as string,
    title:         t.title as string,
    display_order: t.display_order as number,
    is_custom:     t.is_custom as boolean,
    custom_shape:  (t.custom_shape ?? null) as TabRow['custom_shape'],
    columns_def:   ((t.columns_def ?? []) as unknown as TabColumn[]),
    entries:       ((t.entries ?? []) as unknown as ChartEntry[]),
  }));

  // Linked questions — fetch FULL bank rows so each row mapper has
  // everything it needs. All 9 types share MCQ_ROW_COLUMNS; the JSONB
  // content/correct interpretation differs but the column set is
  // identical.
  const itemIds = (itemsResult.data ?? [])
    .map((row) => row.item_id as string)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  let questionsById: Record<string, unknown> = {};
  if (itemIds.length > 0) {
    const { data: qData, error: qErr } = await supabase
      .from(cfg.questionTable)
      .select(MCQ_ROW_COLUMNS)
      .in('item_id', itemIds);

    if (qErr) throw qErr;

    for (const q of qData ?? []) {
      questionsById[(q as { item_id: string }).item_id] = q;
    }
  }

  const itemsByPosition: Record<number, { item_id: string; cjmm_step: SlotRow['cjmm_step'] }> = {};
  for (const row of itemsResult.data ?? []) {
    itemsByPosition[row.position as number] = {
      item_id:   row.item_id as string,
      cjmm_step: (row.cjmm_step ?? null) as SlotRow['cjmm_step'],
    };
  }

  const slots: SlotRow[] = [1, 2, 3, 4, 5, 6].map((position) => {
    const join = itemsByPosition[position];
    if (!join) {
      return {
        position,
        item_id:       null,
        cjmm_step:     null,
        question_type: null,
        stem:          null,
        editor:        null,
      };
    }
    const q = questionsById[join.item_id] as { question_type?: string; stem?: string } | undefined;
    const editor = q ? rowToSlotEditor(q, surface) : null;
    return {
      position,
      item_id:       join.item_id,
      cjmm_step:     join.cjmm_step,
      question_type: q?.question_type ?? null,
      stem:          q?.stem ?? null,
      editor,
    };
  });

  return { surface, caseRow, tabs, slots };
}
