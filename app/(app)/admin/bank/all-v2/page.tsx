// mynclex/app/(app)/admin/bank/all-v2/page.tsx
//
// New admin Question Bank list — slice 2 of the questions-and-wrappers
// rebuild. Lives alongside the legacy /admin/bank/all (which keeps
// working unchanged) until slice 14 swaps them.
//
// Differences vs legacy:
//   - Modal-based editor (no `?edit=` focus mode) for standalone rows.
//   - "+ New question" → type picker → matching editor in create mode.
//   - Wrapper-linked rows show with badges ("In case · {title}" /
//     "Trend · {title}") and link straight to the wrapper page with
//     ?focus=<item_id> instead of opening the standalone modal. The
//     wrapper page parses the focus param and pre-selects the matching
//     pill.
//   - No filters, no search, no pagination yet — those polish in a
//     follow-up slice. Slice 2's job was the create/edit/delete loop;
//     post-slice-13 added the wrapper-aware visibility.

import { requireAdminPermission, PERM_BANK_CURATE } from '@/lib/access';
import {
  BankListV2Client,
  type BankListV2RowSummary,
} from '@/lib/authoring/bank-list-v2-client';
import {
  emptyMcqInitial,
  mcqRowToInitial,
  MCQ_ROW_COLUMNS,
  type McqDbRow,
  type McqEditorInitial,
} from '@/lib/authoring/editors/mcq-row-mapper';
import {
  emptyTfInitial,
  tfRowToInitial,
  type TfEditorInitial,
} from '@/lib/authoring/editors/tf-row-mapper';
import {
  emptySataInitial,
  sataRowToInitial,
  type SataDbRow,
  type SataEditorInitial,
} from '@/lib/authoring/editors/sata-row-mapper';
import {
  emptySelectNInitial,
  selectNRowToInitial,
  type SelectNDbRow,
  type SelectNEditorInitial,
} from '@/lib/authoring/editors/select-n-row-mapper';
import {
  emptyMatrixInitial,
  matrixRowToInitial,
  type MatrixDbRow,
  type MatrixEditorInitial,
} from '@/lib/authoring/editors/matrix-row-mapper';
import {
  emptyBowtieInitial,
  bowtieRowToInitial,
  type BowtieDbRow,
  type BowtieEditorInitial,
} from '@/lib/authoring/editors/bowtie-row-mapper';
import {
  emptyClozeInitial,
  clozeRowToInitial,
  type ClozeDbRow,
  type ClozeEditorInitial,
} from '@/lib/authoring/editors/cloze-row-mapper';
import {
  emptyHighlightInitial,
  highlightRowToInitial,
  type HighlightDbRow,
  type HighlightEditorInitial,
} from '@/lib/authoring/editors/highlight-row-mapper';
import {
  emptyDragDropInitial,
  dragDropRowToInitial,
  type DragDropDbRow,
  type DragDropEditorInitial,
} from '@/lib/authoring/editors/drag-drop-row-mapper';
import type { QuestionType } from '@/lib/authoring/classifications';

export const dynamic = 'force-dynamic';

interface FullBankRow extends McqDbRow {
  parent_case_id: string | null;
  trend_id:       string | null;
  // FK joins for wrapper badges. Supabase returns null when the FK
  // is null. Constraint names follow the default
  // <table>_<column>_fkey pattern, so no `!constraint_name` hint
  // is needed.
  case:  { title: string } | null;
  trend: { title: string } | null;
}

export default async function AdminBankAllV2Page() {
  const { supabase } = await requireAdminPermission(PERM_BANK_CURATE);

  // Pull every bank item — all types, including wrapper-linked. MCQ
  // rows get the full editor data; other types appear with the modal
  // editor wired through the type-specific row mapper. Wrapper-linked
  // rows render with a badge and click through to the wrapper page
  // instead of opening the standalone modal.
  const { data, error } = await supabase
    .from('nclex_bank_items')
    .select(
      MCQ_ROW_COLUMNS +
      ', parent_case_id, trend_id, ' +
      'trend:nclex_trend_datasets(title), ' +
      'case:nclex_case_studies(title)',
    )
    .order('item_id', { ascending: true })
    .returns<FullBankRow[]>();

  if (error) {
    return (
      <main className="auth-list-page">
        <div className="auth-list-inner">
          <h1 className="auth-list-page-title">Question Bank (v2)</h1>
          <p className="auth-sandbox-error">
            Could not load the bank: {error.message}
          </p>
        </div>
      </main>
    );
  }

  const fullRows = data ?? [];

  const summaryRows: BankListV2RowSummary[] = fullRows.map((r) => ({
    item_id:        r.item_id,
    question_type:  r.question_type as QuestionType,
    stem:           r.stem ?? '',
    difficulty:     r.difficulty,
    is_published:   r.is_published,
    is_free_sample: r.is_free_sample,
    parent_case_id: r.parent_case_id,
    case_title:     r.case?.title ?? null,
    trend_id:       r.trend_id,
    trend_title:    r.trend?.title ?? null,
  }));

  const mcqInitialsById: Record<string, McqEditorInitial> = {};
  const tfInitialsById: Record<string, TfEditorInitial> = {};
  const sataInitialsById: Record<string, SataEditorInitial> = {};
  const selectNInitialsById: Record<string, SelectNEditorInitial> = {};
  const matrixInitialsById: Record<string, MatrixEditorInitial> = {};
  const bowtieInitialsById: Record<string, BowtieEditorInitial> = {};
  const clozeInitialsById: Record<string, ClozeEditorInitial> = {};
  const highlightInitialsById: Record<string, HighlightEditorInitial> = {};
  const dragDropInitialsById: Record<string, DragDropEditorInitial> = {};
  for (const row of fullRows) {
    if (row.question_type === 'MCQ') {
      mcqInitialsById[row.item_id] = mcqRowToInitial(row, 'admin');
    } else if (row.question_type === 'TF') {
      tfInitialsById[row.item_id] = tfRowToInitial(row, 'admin');
    } else if (row.question_type === 'SATA') {
      sataInitialsById[row.item_id] = sataRowToInitial(
        row as unknown as SataDbRow,
        'admin',
      );
    } else if (row.question_type === 'SELECT_N') {
      selectNInitialsById[row.item_id] = selectNRowToInitial(
        row as unknown as SelectNDbRow,
        'admin',
      );
    } else if (row.question_type === 'MATRIX') {
      matrixInitialsById[row.item_id] = matrixRowToInitial(
        row as unknown as MatrixDbRow,
        'admin',
      );
    } else if (row.question_type === 'BOWTIE') {
      bowtieInitialsById[row.item_id] = bowtieRowToInitial(
        row as unknown as BowtieDbRow,
        'admin',
      );
    } else if (row.question_type === 'CLOZE') {
      clozeInitialsById[row.item_id] = clozeRowToInitial(
        row as unknown as ClozeDbRow,
        'admin',
      );
    } else if (row.question_type === 'HIGHLIGHT') {
      highlightInitialsById[row.item_id] = highlightRowToInitial(
        row as unknown as HighlightDbRow,
        'admin',
      );
    } else if (row.question_type === 'DRAG_DROP') {
      dragDropInitialsById[row.item_id] = dragDropRowToInitial(
        row as unknown as DragDropDbRow,
        'admin',
      );
    }
  }

  return (
    <main className="auth-list-page">
      <div className="auth-list-inner">
        <header className="auth-list-page-header">
          <h1 className="auth-list-page-title">Question Bank (v2)</h1>
          <p className="auth-list-page-subtitle">
            Questions-and-wrappers rebuild · admin surface · all 9 question types: MCQ + TF + SATA + SELECT_N + MATRIX + BOWTIE + CLOZE + HIGHLIGHT + DRAG_DROP
          </p>
        </header>

        <BankListV2Client
          surface="admin"
          rows={summaryRows}
          mcqInitialsById={mcqInitialsById}
          emptyMcqInitial={emptyMcqInitial('admin')}
          tfInitialsById={tfInitialsById}
          emptyTfInitial={emptyTfInitial('admin')}
          sataInitialsById={sataInitialsById}
          emptySataInitial={emptySataInitial('admin')}
          selectNInitialsById={selectNInitialsById}
          emptySelectNInitial={emptySelectNInitial('admin')}
          matrixInitialsById={matrixInitialsById}
          emptyMatrixInitial={emptyMatrixInitial('admin')}
          bowtieInitialsById={bowtieInitialsById}
          emptyBowtieInitial={emptyBowtieInitial('admin')}
          clozeInitialsById={clozeInitialsById}
          emptyClozeInitial={emptyClozeInitial('admin')}
          highlightInitialsById={highlightInitialsById}
          emptyHighlightInitial={emptyHighlightInitial('admin')}
          dragDropInitialsById={dragDropInitialsById}
          emptyDragDropInitial={emptyDragDropInitial('admin')}
        />
      </div>
    </main>
  );
}
