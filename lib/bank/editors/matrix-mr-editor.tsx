// mynclex/lib/bank/editors/matrix-mr-editor.tsx
//
// MATRIX_MR editor — Matrix Multiple Response. Own self-contained editor,
// mirrored from matrix-editor.tsx. The grid is identical (rows × columns,
// editable corner / headers / row labels / per-row feedback, all rich via
// the one roving toolbar), but each row may have ONE OR MORE correct
// columns: the cell control is a CHECKBOX, and `correct` maps a rowId to an
// ARRAY of column ids.
//
// Validation philosophy (advise > block): the structural rules hard-block
// (>= 2 rows, >= 2 cols, every filled row has >= 1 correct — Q1); the NGN
// norm (4–10 rows, 2–3 cols) is a soft amber advisory only.
//
// FormData contract (mirrors MatrixMrParseInput) — each rich field
// serialises its doc to JSON inside its own hidden input; the correct
// picks ride as repeated checkbox values per row:
//   matrixmr_row_label        — single value (the editable corner cell)
//   matrixmr_row_id           — array, one per row, in order
//   matrixmr_row_text         — array, one per row, matching order
//   matrixmr_row_feedback     — array, one per row, matching order
//   matrixmr_col_id           — array, one per column, in order
//   matrixmr_col_text         — array, one per column, matching order
//   matrixmr_correct_<rowId>  — checkbox name PER ROW; 0..N values (picked col ids)

'use client';

import { Fragment, useState } from 'react';
import {
  MIN_MATRIX_MR_ROWS,
  MAX_MATRIX_MR_ROWS,
  MIN_MATRIX_MR_COLS,
  MAX_MATRIX_MR_COLS,
  RECOMMENDED_MIN_MATRIX_MR_ROWS,
  RECOMMENDED_MAX_MATRIX_MR_COLS,
} from '@/lib/bank/classifications';
import { ModalFrame } from '@/lib/bank/atoms/modal-frame';
import { EditorActions } from '@/lib/bank/atoms/editor-actions';
import { EditorTabs, TabPanel } from '@/lib/bank/atoms/editor-tabs';
import { EditorAuthorship } from '@/lib/audit/authorship-line';
import { ClassificationFields } from '@/lib/bank/atoms/classification-fields';
import { HousekeepingFields } from '@/lib/bank/atoms/housekeeping-fields';
import { HiddenItemInputs } from '@/lib/bank/atoms/hidden-item-inputs';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { DeleteConfirm } from '@/lib/overlays/bank/delete-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import {
  PreviewToggle,
  type PreviewViewMode,
} from '@/lib/bank/atoms/preview-toggle';
import { useSaveAction } from '@/lib/bank/hooks/use-save-action';
import { useDirtyGuard } from '@/lib/bank/hooks/use-dirty-guard';
import {
  saveQuestionAction,
  type SaveResult,
} from '@/lib/bank/actions/save-question';
import {
  deleteQuestionAction,
  type DeleteResult,
} from '@/lib/bank/actions/delete-question';
import {
  RovingProvider,
  RovingToolbar,
  RovingRichField,
} from '@/lib/authoring/roving-rich';
import {
  RichInstructionField,
  RichStemField,
  RichRationaleFields,
} from '@/lib/authoring/rich-atoms';
import { RichRender } from '@/lib/authoring/rich-render';
import {
  parseRichDoc,
  isEmptyRichDoc,
  richTextToPlain,
  type RichDoc,
} from '@/lib/authoring/rich-doc';
import type { MatrixMrEditorInitial } from './matrix-mr-row-mapper';

export type { MatrixMrEditorInitial };

// ─────────────────────────────────────────────────────────────
// Editor-state shapes — the in-memory grid carries rich docs for the
// display text. `correct` maps a rowId to an array of picked column ids.
// ─────────────────────────────────────────────────────────────

interface GridRow {
  id: string;          // 'r1', 'r2', ...
  text: RichDoc;
  feedback: RichDoc;
}

interface GridColumn {
  id: string;          // 'c1', 'c2', ...
  text: RichDoc;
}

function emptyDoc(): RichDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

// ─────────────────────────────────────────────────────────────
// MatrixMrGrid — the editable rows × columns grid (private). Same as the
// MATRIX grid but every cell is a CHECKBOX (multi-select per row).
// ─────────────────────────────────────────────────────────────

interface MatrixMrGridProps {
  rowLabel: RichDoc;
  rows: GridRow[];
  columns: GridColumn[];
  correct: Record<string, string[]>;
  disabled: boolean;
  onChange: (next: {
    rowLabel: RichDoc;
    rows: GridRow[];
    columns: GridColumn[];
    correct: Record<string, string[]>;
  }) => void;
}

function MatrixMrGrid({
  rowLabel,
  rows,
  columns,
  correct,
  disabled,
  onChange,
}: MatrixMrGridProps) {
  function nextRowId(): string {
    const used = new Set(rows.map((r) => r.id));
    let n = 1;
    while (used.has(`r${n}`)) n++;
    return `r${n}`;
  }
  function nextColId(): string {
    const used = new Set(columns.map((c) => c.id));
    let n = 1;
    while (used.has(`c${n}`)) n++;
    return `c${n}`;
  }

  function update(partial: Partial<{
    rowLabel: RichDoc;
    rows: GridRow[];
    columns: GridColumn[];
    correct: Record<string, string[]>;
  }>) {
    onChange({
      rowLabel,
      rows,
      columns,
      correct,
      ...partial,
    });
  }

  function addRow() {
    if (rows.length >= MAX_MATRIX_MR_ROWS) return;
    update({ rows: [...rows, { id: nextRowId(), text: emptyDoc(), feedback: emptyDoc() }] });
  }
  function removeRow(idx: number) {
    if (rows.length <= MIN_MATRIX_MR_ROWS) return;
    const removedId = rows[idx].id;
    const nextRows = rows.filter((_, i) => i !== idx);
    if (correct[removedId]) {
      const nextCorrect = { ...correct };
      delete nextCorrect[removedId];
      update({ rows: nextRows, correct: nextCorrect });
    } else {
      update({ rows: nextRows });
    }
  }
  function updateRowText(idx: number, text: RichDoc) {
    update({ rows: rows.map((r, i) => (i === idx ? { ...r, text } : r)) });
  }
  function updateRowFeedback(idx: number, feedback: RichDoc) {
    update({ rows: rows.map((r, i) => (i === idx ? { ...r, feedback } : r)) });
  }

  function addColumn() {
    if (columns.length >= MAX_MATRIX_MR_COLS) return;
    update({ columns: [...columns, { id: nextColId(), text: emptyDoc() }] });
  }
  function removeColumn(idx: number) {
    if (columns.length <= MIN_MATRIX_MR_COLS) return;
    const removedId = columns[idx].id;
    const nextCols = columns.filter((_, i) => i !== idx);
    // Wipe any picks that pointed at the removed column.
    const nextCorrect: Record<string, string[]> = {};
    for (const [rowId, colIds] of Object.entries(correct)) {
      const kept = colIds.filter((id) => id !== removedId);
      if (kept.length > 0) nextCorrect[rowId] = kept;
    }
    update({ columns: nextCols, correct: nextCorrect });
  }
  function updateColText(idx: number, text: RichDoc) {
    update({ columns: columns.map((c, i) => (i === idx ? { ...c, text } : c)) });
  }

  function toggleCorrect(rowId: string, colId: string) {
    const cur = correct[rowId] ?? [];
    const next = cur.includes(colId)
      ? cur.filter((c) => c !== colId)
      : [...cur, colId];
    const nextCorrect = { ...correct };
    if (next.length > 0) nextCorrect[rowId] = next;
    else delete nextCorrect[rowId];
    update({ correct: nextCorrect });
  }

  const filledRows = rows.filter((r) => !isEmptyRichDoc(r.text)).length;
  const filledCols = columns.filter((c) => !isEmptyRichDoc(c.text)).length;
  const pickedRows = rows.filter(
    (r) => !isEmptyRichDoc(r.text) && (correct[r.id]?.length ?? 0) > 0,
  ).length;

  return (
    <div className="auth-fg">
      <div className="auth-label-row">
        <label className="auth-label">Matrix grid (multiple response) *</label>
        <div className="auth-matrix-controls">
          <button
            type="button"
            className="auth-link-btn"
            onClick={addRow}
            disabled={disabled || rows.length >= MAX_MATRIX_MR_ROWS}
          >
            + Add row
          </button>
          <button
            type="button"
            className="auth-link-btn"
            onClick={addColumn}
            disabled={disabled || columns.length >= MAX_MATRIX_MR_COLS}
          >
            + Add column
          </button>
        </div>
      </div>
      <p className="auth-hint">
        Tick every correct column in each row — a row may have one or more
        correct answers. Each row needs at least one. Per-row feedback is
        optional; blank rows fall back to the overall rationale.
      </p>

      <div className="auth-matrix-wrap">
        <table className="auth-matrix-table">
          <thead>
            <tr>
              <th className="auth-matrix-corner">
                <RovingRichField
                  fieldKey="mmr:rowlabel"
                  name="matrixmr_row_label"
                  value={rowLabel}
                  onChange={(doc) => update({ rowLabel: doc })}
                  inline
                  className="auth-rrf-mx-corner"
                  ariaLabel="Row-axis label"
                  placeholder="e.g. Finding, Medication…"
                />
              </th>
              {columns.map((col, cIdx) => (
                <th key={col.id} className="auth-matrix-col-head">
                  <RovingRichField
                    fieldKey={`mmr:col:${col.id}`}
                    name="matrixmr_col_text"
                    value={col.text}
                    onChange={(doc) => updateColText(cIdx, doc)}
                    inline
                    className="auth-rrf-mx-col"
                    ariaLabel={`Column ${cIdx + 1} text`}
                    placeholder={`Col ${cIdx + 1}`}
                  />
                  <input type="hidden" name="matrixmr_col_id" value={col.id} />
                  <button
                    type="button"
                    className="auth-matrix-col-remove"
                    onClick={() => removeColumn(cIdx)}
                    disabled={disabled || columns.length <= MIN_MATRIX_MR_COLS}
                    title="Remove column"
                  >
                    ✕
                  </button>
                </th>
              ))}
              <th className="auth-matrix-row-actions" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <Fragment key={row.id}>
                <tr>
                  <td className="auth-matrix-row-head">
                    <RovingRichField
                      fieldKey={`mmr:row:${row.id}`}
                      name="matrixmr_row_text"
                      value={row.text}
                      onChange={(doc) => updateRowText(rIdx, doc)}
                      inline
                      className="auth-rrf-mx-row"
                      ariaLabel={`Row ${rIdx + 1} text`}
                      placeholder={`Row ${rIdx + 1} text…`}
                    />
                    <input type="hidden" name="matrixmr_row_id" value={row.id} />
                  </td>
                  {columns.map((col) => (
                    <td key={col.id} className="auth-matrix-cell">
                      <input
                        type="checkbox"
                        name={`matrixmr_correct_${row.id}`}
                        value={col.id}
                        checked={(correct[row.id] ?? []).includes(col.id)}
                        onChange={() => toggleCorrect(row.id, col.id)}
                        disabled={disabled}
                        title="Mark this column correct for this row"
                      />
                    </td>
                  ))}
                  <td className="auth-matrix-row-actions">
                    <button
                      type="button"
                      className="auth-row-remove"
                      onClick={() => removeRow(rIdx)}
                      disabled={disabled || rows.length <= MIN_MATRIX_MR_ROWS}
                      title="Remove row"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
                <tr className="auth-matrix-feedback-row">
                  <td colSpan={columns.length + 2}>
                    <label className="auth-matrix-feedback-label">
                      Feedback for this row (optional)
                    </label>
                    <RovingRichField
                      fieldKey={`mmr:fb:${row.id}`}
                      name="matrixmr_row_feedback"
                      value={row.feedback}
                      onChange={(doc) => updateRowFeedback(rIdx, doc)}
                      inline
                      className="auth-rrf-mx-fb"
                      ariaLabel={`Feedback for row ${rIdx + 1}`}
                      placeholder="Leave blank to fall back to the overall rationale…"
                    />
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="auth-matrix-bounds">
        <span>
          <strong>Rows:</strong> {filledRows}/{rows.length} filled · {MIN_MATRIX_MR_ROWS}–{MAX_MATRIX_MR_ROWS} allowed
        </span>
        <span>
          <strong>Columns:</strong> {filledCols}/{columns.length} filled · {MIN_MATRIX_MR_COLS}–{MAX_MATRIX_MR_COLS} allowed
        </span>
        <span>
          <strong>Rows with a correct pick:</strong> {pickedRows}/{filledRows}
        </span>
      </div>

      {filledRows > 0 && filledRows < RECOMMENDED_MIN_MATRIX_MR_ROWS && (
        <p className="auth-mmr-advisory">
          NGN matrix items usually run {RECOMMENDED_MIN_MATRIX_MR_ROWS}–{MAX_MATRIX_MR_ROWS} rows.
          Fewer is allowed — just a nudge toward the exam norm.
        </p>
      )}
      {filledCols > RECOMMENDED_MAX_MATRIX_MR_COLS && (
        <p className="auth-mmr-advisory">
          NGN matrix items usually use 2–{RECOMMENDED_MAX_MATRIX_MR_COLS} columns.
          Wider grids are allowed — just a nudge toward the exam norm.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MatrixMrPreview — dual-mode preview (private). Renders the grid as
// the student will see it. Answer-key view fills every cell that is in
// `correct[rowId]` with a green tint + filled green box. Rich throughout.
// The `.multi` modifier swaps the radio dot for a checkbox square.
// ─────────────────────────────────────────────────────────────

interface MatrixMrPreviewProps {
  instruction: RichDoc;
  stem: RichDoc;
  rowLabel: RichDoc;
  rows: GridRow[];
  columns: GridColumn[];
  correct: Record<string, string[]>;
  viewMode: PreviewViewMode;
  onViewModeChange: (next: PreviewViewMode) => void;
}

export function MatrixMrPreview({
  instruction,
  stem,
  rowLabel,
  rows,
  columns,
  correct,
  viewMode,
  onViewModeChange,
}: MatrixMrPreviewProps) {
  const headerText =
    viewMode === 'answer-key'
      ? 'Answer key · curator view'
      : 'Pre-submit · student view';

  return (
    <div className="auth-preview-card">
      <div className="auth-preview-card-header">
        <div className="auth-preview-card-header-text">{headerText}</div>
        <PreviewToggle value={viewMode} onChange={onViewModeChange} />
      </div>
      <div className="auth-preview-card-body">
        {!isEmptyRichDoc(instruction) && (
          <p className="auth-preview-instruction">
            <RichRender doc={instruction} inline />
          </p>
        )}
        <div className="auth-preview-stem">
          {isEmptyRichDoc(stem) ? (
            <span className="auth-preview-placeholder">Stem appears here…</span>
          ) : (
            <RichRender doc={stem} />
          )}
        </div>
        <div className="auth-matrix-preview-wrap">
          <table className="auth-matrix-preview-table multi">
            <thead>
              <tr>
                <th className="auth-matrix-preview-corner">
                  {isEmptyRichDoc(rowLabel) ? (
                    <span className="auth-preview-placeholder">Row label…</span>
                  ) : (
                    <RichRender doc={rowLabel} inline />
                  )}
                </th>
                {columns.map((col, cIdx) => (
                  <th key={col.id} className="auth-matrix-preview-col-head">
                    {isEmptyRichDoc(col.text) ? (
                      <span className="auth-preview-placeholder">Col {cIdx + 1}</span>
                    ) : (
                      <RichRender doc={col.text} inline />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => (
                <tr key={row.id}>
                  <td className="auth-matrix-preview-row-head">
                    {isEmptyRichDoc(row.text) ? (
                      <span className="auth-preview-placeholder">Row {rIdx + 1}…</span>
                    ) : (
                      <RichRender doc={row.text} inline />
                    )}
                  </td>
                  {columns.map((col) => {
                    const isCorrect =
                      viewMode === 'answer-key' && (correct[row.id] ?? []).includes(col.id);
                    return (
                      <td
                        key={col.id}
                        className={
                          'auth-matrix-preview-cell' +
                          (isCorrect ? ' auth-matrix-preview-cell-correct' : '')
                        }
                      >
                        <span
                          className={
                            isCorrect
                              ? 'auth-matrix-preview-radio auth-matrix-preview-radio-correct'
                              : 'auth-matrix-preview-radio'
                          }
                          aria-hidden="true"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MatrixMrEditorBody — two-pane edit + preview body. Mountable anywhere.
// ─────────────────────────────────────────────────────────────

const FORM_ID = 'auth-matrix-mr-form';

export interface MatrixMrEditorBodyProps {
  initial: MatrixMrEditorInitial;
  error: string | null;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onDirty?: () => void;
  onErrorDismiss?: () => void;
}

export function MatrixMrEditorBody({
  initial,
  error,
  pending,
  onSubmit,
  onDirty,
  onErrorDismiss,
}: MatrixMrEditorBodyProps) {
  const [tab, setTab] = useState<'content' | 'classification' | 'housekeeping'>('content');
  const [clientError, setClientError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PreviewViewMode>('student');

  const [stem, setStem] = useState<RichDoc>(() => parseRichDoc(initial.stem));
  const [instruction, setInstruction] = useState<RichDoc>(() => parseRichDoc(initial.instruction));
  const [rationale, setRationale] = useState<RichDoc>(() => parseRichDoc(initial.rationale));
  const [rowLabel, setRowLabel] = useState<RichDoc>(() => parseRichDoc(initial.row_label));
  const [rows, setRows] = useState<GridRow[]>(() =>
    initial.rows.map((r) => ({
      id: r.id,
      text: parseRichDoc(r.text),
      feedback: parseRichDoc(r.feedback),
    })),
  );
  const [columns, setColumns] = useState<GridColumn[]>(() =>
    initial.columns.map((c) => ({ id: c.id, text: parseRichDoc(c.text) })),
  );
  const [correct, setCorrect] = useState<Record<string, string[]>>(initial.correct);
  const [category, setCategory] = useState(initial.client_needs_category);

  function markDirty() {
    onDirty?.();
  }

  const filledRows = rows.filter((r) => !isEmptyRichDoc(r.text));
  const filledCols = columns.filter((c) => !isEmptyRichDoc(c.text));
  const allFilledRowsPicked =
    filledRows.length > 0 && filledRows.every((r) => (correct[r.id]?.length ?? 0) > 0);

  const contentIncomplete =
    isEmptyRichDoc(stem) ||
    isEmptyRichDoc(rowLabel) ||
    filledRows.length < MIN_MATRIX_MR_ROWS ||
    filledCols.length < MIN_MATRIX_MR_COLS ||
    !allFilledRowsPicked;
  const classificationIncomplete = !category;

  // Live marks for the Housekeeping readout. Per bank-marks-and-scoring §5.2:
  // MATRIX_MR max = total number of correct cells across all filled rows
  // (each row scored SATA-style). Mirrors the parser's `cells` build.
  const liveMarks = filledRows.reduce(
    (sum, r) => sum + (correct[r.id]?.length ?? 0),
    0,
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (contentIncomplete) {
      setTab('content');
      setClientError(
        allFilledRowsPicked
          ? 'Fill in the required fields on Content to continue.'
          : 'Each row needs at least one correct column ticked.',
      );
      return;
    }
    if (classificationIncomplete) {
      setTab('classification');
      setClientError('Pick a Client Needs category to continue.');
      return;
    }
    setClientError(null);
    onSubmit(new FormData(e.currentTarget));
  }

  function dismissError() {
    setClientError(null);
    onErrorDismiss?.();
  }

  function handleGridChange(next: {
    rowLabel: RichDoc;
    rows: GridRow[];
    columns: GridColumn[];
    correct: Record<string, string[]>;
  }) {
    setRowLabel(next.rowLabel);
    setRows(next.rows);
    setColumns(next.columns);
    setCorrect(next.correct);
    markDirty();
  }

  return (
    <form
      id={FORM_ID}
      className="auth-form"
      noValidate
      onSubmit={handleSubmit}
      onInput={onDirty}
    >
      <HiddenItemInputs type="MATRIX_MR" itemId={initial.itemId} surface={initial.surface} />

      <ErrorToast error={error ?? clientError} onDismiss={dismissError} />

      <EditorAuthorship
        realm={initial.surface}
        entityType={initial.surface === 'tutor' ? 'tutor_question' : 'bank_item'}
        itemId={initial.itemId}
        title={richTextToPlain(initial.stem)}
      />
      <RovingProvider>
        <div className="auth-split">
          <div className="auth-edit">
            <EditorTabs
              tabs={[
                { id: 'content',        label: 'Content',        incomplete: contentIncomplete },
                { id: 'classification', label: 'Classification', incomplete: classificationIncomplete },
                { id: 'housekeeping',   label: 'Housekeeping' },
              ]}
              active={tab}
              onChange={(id) => setTab(id as typeof tab)}
            >
              <TabPanel id="content">
                <RovingToolbar hint="Click into a field to format it" />
                <RichInstructionField
                  value={instruction}
                  onChange={(doc) => { setInstruction(doc); markDirty(); }}
                />
                <RichStemField
                  value={stem}
                  onChange={(doc) => { setStem(doc); markDirty(); }}
                />
                <MatrixMrGrid
                  rowLabel={rowLabel}
                  rows={rows}
                  columns={columns}
                  correct={correct}
                  disabled={pending}
                  onChange={handleGridChange}
                />
                <RichRationaleFields
                  rationale={rationale}
                  onRationaleChange={(doc) => { setRationale(doc); markDirty(); }}
                  defaultRationaleImg={initial.rationale_img}
                />
              </TabPanel>

              <TabPanel id="classification">
                <ClassificationFields
                  category={category}
                  onCategoryChange={setCategory}
                  defaults={{
                    client_needs_subcategory: initial.client_needs_subcategory,
                    nursing_subject: initial.nursing_subject,
                    body_system: initial.body_system,
                    topic: initial.topic,
                    subtopic: initial.subtopic,
                    difficulty: initial.difficulty,
                    bloom_level: initial.bloom_level,
                    tags: initial.tags,
                  }}
                />
              </TabPanel>

              <TabPanel id="housekeeping">
                <HousekeepingFields
                  mode={initial.mode}
                  questionType="MATRIX_MR"
                  defaults={{
                    marks: liveMarks,
                    question_ref: initial.question_ref,
                    batch_id: initial.batch_id,
                    is_published: initial.is_published,
                    is_free_sample: initial.is_free_sample,
                    is_builder_visible: initial.is_builder_visible,
                    shuffle_options: initial.shuffle_options,
                  }}
                />
              </TabPanel>
            </EditorTabs>
          </div>

          <div className="auth-preview">
            <MatrixMrPreview
              instruction={instruction}
              stem={stem}
              rowLabel={rowLabel}
              rows={rows}
              columns={columns}
              correct={correct}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          </div>
        </div>
      </RovingProvider>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// MatrixMrEditor — default standalone modal host. Same wiring as MATRIX.
// ─────────────────────────────────────────────────────────────

export interface MatrixMrEditorProps {
  initial: MatrixMrEditorInitial;
  onClose: () => void;
  onSaved?: (result: { item_id: string; created: boolean }) => void;
  onDeleted?: (item_id: string) => void;
}

export function MatrixMrEditor({ initial, onClose, onSaved, onDeleted }: MatrixMrEditorProps) {
  const isEdit = initial.itemId !== null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  const guard = useDirtyGuard({
    onClose,
    onSaveAndClose: () => {
      const form = document.getElementById(FORM_ID);
      if (form instanceof HTMLFormElement) form.requestSubmit();
    },
  });

  const save = useSaveAction<SaveResult>(saveQuestionAction, {
    onSuccess: (result) => {
      if (result.ok) {
        guard.clearDirty();
        onSaved?.({ item_id: result.item_id, created: result.created });
        onClose();
      }
    },
  });

  const del = useSaveAction<DeleteResult>(deleteQuestionAction, {
    onSuccess: (result) => {
      if (result.ok) {
        guard.clearDirty();
        onDeleted?.(result.item_id);
        onClose();
      }
    },
  });

  const pending = save.pending || del.pending;
  const error = save.error ?? del.error;

  function startDelete() {
    setConfirmingDelete(true);
    setDeleteText('');
    save.clearError();
    del.clearError();
  }

  function cancelDelete() {
    setConfirmingDelete(false);
    setDeleteText('');
  }

  function confirmDelete() {
    if (!initial.itemId) return;
    if (deleteText !== 'DELETE') return;
    const fd = new FormData();
    fd.set('item_id', initial.itemId);
    fd.set('surface', initial.surface);
    del.submit(fd);
  }

  return (
    <ModalFrame
      title={isEdit ? `Edit Matrix MR — ${initial.itemId}` : 'New Matrix Multiple Response question'}
      onClose={pending ? () => undefined : guard.requestClose}
      actions={
        <EditorActions
          canDelete={isEdit}
          pending={pending || confirmingDelete || guard.confirming}
          onCancel={guard.requestClose}
          onDelete={isEdit ? startDelete : undefined}
          formId={FORM_ID}
        />
      }
    >
      {guard.confirming && (
        <DiscardConfirm
          onKeepEditing={guard.keepEditing}
          onDiscard={guard.discardAndClose}
          onSaveAndClose={guard.saveAndClose}
          pending={save.pending}
        />
      )}
      {confirmingDelete && initial.itemId && (
        <DeleteConfirm
          itemId={initial.itemId}
          deleteText={deleteText}
          pending={del.pending}
          onTextChange={setDeleteText}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
      <MatrixMrEditorBody
        initial={initial}
        error={error}
        pending={pending}
        onSubmit={save.submit}
        onDirty={guard.markDirty}
        onErrorDismiss={() => {
          save.clearError();
          del.clearError();
        }}
      />
    </ModalFrame>
  );
}
