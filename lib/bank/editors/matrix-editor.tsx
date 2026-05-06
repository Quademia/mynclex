// mynclex/lib/bank/editors/matrix-editor.tsx
//
// MATRIX editor — fifth concrete editor in the rebuild. First slice
// where the option-list shape doesn't apply: the curator builds a
// rows × columns grid, picks one correct column per row, and
// optionally writes per-row feedback.
//
// FormData contract (matches the legacy parser's MatrixParseInput):
//   matrix_row_label        — single value (the editable corner cell)
//   matrix_row_id           — array, one per row, in order
//   matrix_row_text         — array, one per row, matching order
//   matrix_row_feedback     — array, one per row, matching order
//   matrix_col_id           — array, one per column, in order
//   matrix_col_text         — array, one per column, matching order
//   matrix_correct_<rowId>  — radio name PER ROW; value is the picked column id

'use client';

import { Fragment, useState } from 'react';
import {
  MIN_MATRIX_ROWS,
  MAX_MATRIX_ROWS,
  MIN_MATRIX_COLS,
  MAX_MATRIX_COLS,
} from '@/lib/bank/classifications';
import { ModalFrame } from '@/lib/bank/atoms/modal-frame';
import { EditorActions } from '@/lib/bank/atoms/editor-actions';
import { EditorTabs, TabPanel } from '@/lib/bank/atoms/editor-tabs';
import { StemField } from '@/lib/bank/atoms/stem-field';
import { InstructionField } from '@/lib/bank/atoms/instruction-field';
import { RationaleFields } from '@/lib/bank/atoms/rationale-fields';
import { ClassificationFields } from '@/lib/bank/atoms/classification-fields';
import { HousekeepingFields } from '@/lib/bank/atoms/housekeeping-fields';
import { HiddenItemInputs } from '@/lib/bank/atoms/hidden-item-inputs';
import { DiscardConfirm } from '@/lib/bank/atoms/discard-confirm';
import { DeleteConfirm } from '@/lib/bank/atoms/delete-confirm';
import { ErrorToast } from '@/lib/bank/atoms/error-toast';
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
import type {
  MatrixEditorInitial,
  MatrixEditorRow,
  MatrixEditorColumn,
} from './matrix-row-mapper';

export type { MatrixEditorInitial };

// ─────────────────────────────────────────────────────────────
// MatrixGrid — the editable rows × columns grid (private). Renders
// a <table> with: editable corner (row_label), editable column
// headers, editable row headers, a radio per cell for the correct
// pick, and a feedback row beneath each data row.
// ─────────────────────────────────────────────────────────────

interface MatrixGridProps {
  rowLabel: string;
  rows: MatrixEditorRow[];
  columns: MatrixEditorColumn[];
  correct: Record<string, string>;
  disabled: boolean;
  onChange: (next: {
    rowLabel: string;
    rows: MatrixEditorRow[];
    columns: MatrixEditorColumn[];
    correct: Record<string, string>;
  }) => void;
}

function MatrixGrid({
  rowLabel,
  rows,
  columns,
  correct,
  disabled,
  onChange,
}: MatrixGridProps) {
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
    rowLabel: string;
    rows: MatrixEditorRow[];
    columns: MatrixEditorColumn[];
    correct: Record<string, string>;
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
    if (rows.length >= MAX_MATRIX_ROWS) return;
    update({ rows: [...rows, { id: nextRowId(), text: '', feedback: '' }] });
  }
  function removeRow(idx: number) {
    if (rows.length <= MIN_MATRIX_ROWS) return;
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
  function updateRowText(idx: number, text: string) {
    update({ rows: rows.map((r, i) => (i === idx ? { ...r, text } : r)) });
  }
  function updateRowFeedback(idx: number, feedback: string) {
    update({ rows: rows.map((r, i) => (i === idx ? { ...r, feedback } : r)) });
  }

  function addColumn() {
    if (columns.length >= MAX_MATRIX_COLS) return;
    update({ columns: [...columns, { id: nextColId(), text: '' }] });
  }
  function removeColumn(idx: number) {
    if (columns.length <= MIN_MATRIX_COLS) return;
    const removedId = columns[idx].id;
    const nextCols = columns.filter((_, i) => i !== idx);
    // Wipe any picks that pointed at the removed column.
    const nextCorrect: Record<string, string> = {};
    for (const [rowId, colId] of Object.entries(correct)) {
      if (colId !== removedId) nextCorrect[rowId] = colId;
    }
    update({ columns: nextCols, correct: nextCorrect });
  }
  function updateColText(idx: number, text: string) {
    update({ columns: columns.map((c, i) => (i === idx ? { ...c, text } : c)) });
  }

  function pickCorrect(rowId: string, colId: string) {
    update({ correct: { ...correct, [rowId]: colId } });
  }

  const filledRows = rows.filter((r) => r.text.trim().length > 0).length;
  const filledCols = columns.filter((c) => c.text.trim().length > 0).length;
  const pickedRows = rows.filter((r) => r.text.trim() && correct[r.id]).length;

  return (
    <div className="auth-fg">
      <div className="auth-label-row">
        <label className="auth-label">Matrix grid *</label>
        <div className="auth-matrix-controls">
          <button
            type="button"
            className="auth-link-btn"
            onClick={addRow}
            disabled={disabled || rows.length >= MAX_MATRIX_ROWS}
          >
            + Add row
          </button>
          <button
            type="button"
            className="auth-link-btn"
            onClick={addColumn}
            disabled={disabled || columns.length >= MAX_MATRIX_COLS}
          >
            + Add column
          </button>
        </div>
      </div>
      <p className="auth-hint">
        Click a radio in each row to mark the correct column. Per-row
        feedback is optional; blank rows fall back to the overall rationale.
      </p>

      {/* Hidden mirror of row-label for the form-data. The visible
          input lives in the corner cell below for layout reasons. */}
      <input type="hidden" name="matrix_row_label" value={rowLabel} />

      <div className="auth-matrix-wrap">
        <table className="auth-matrix-table">
          <thead>
            <tr>
              <th className="auth-matrix-corner">
                <input
                  type="text"
                  value={rowLabel}
                  onChange={(e) => update({ rowLabel: e.target.value })}
                  placeholder="e.g. Finding, Medication…"
                  disabled={disabled}
                  className="auth-matrix-corner-input"
                />
              </th>
              {columns.map((col, cIdx) => (
                <th key={col.id} className="auth-matrix-col-head">
                  <input
                    type="text"
                    value={col.text}
                    onChange={(e) => updateColText(cIdx, e.target.value)}
                    placeholder={`Col ${cIdx + 1}`}
                    disabled={disabled}
                    className="auth-matrix-col-input"
                  />
                  <input type="hidden" name="matrix_col_id" value={col.id} />
                  <input type="hidden" name="matrix_col_text" value={col.text} />
                  <button
                    type="button"
                    className="auth-matrix-col-remove"
                    onClick={() => removeColumn(cIdx)}
                    disabled={disabled || columns.length <= MIN_MATRIX_COLS}
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
                    <input
                      type="text"
                      value={row.text}
                      onChange={(e) => updateRowText(rIdx, e.target.value)}
                      placeholder={`Row ${rIdx + 1} text…`}
                      disabled={disabled}
                      className="auth-matrix-row-input"
                    />
                    <input type="hidden" name="matrix_row_id" value={row.id} />
                    <input type="hidden" name="matrix_row_text" value={row.text} />
                  </td>
                  {columns.map((col) => (
                    <td key={col.id} className="auth-matrix-cell">
                      <input
                        type="radio"
                        name={`matrix_correct_${row.id}`}
                        value={col.id}
                        checked={correct[row.id] === col.id}
                        onChange={() => pickCorrect(row.id, col.id)}
                        disabled={disabled}
                        title={`Mark ${col.text || 'this column'} correct for this row`}
                      />
                    </td>
                  ))}
                  <td className="auth-matrix-row-actions">
                    <button
                      type="button"
                      className="auth-row-remove"
                      onClick={() => removeRow(rIdx)}
                      disabled={disabled || rows.length <= MIN_MATRIX_ROWS}
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
                    <input
                      type="text"
                      name="matrix_row_feedback"
                      value={row.feedback}
                      onChange={(e) => updateRowFeedback(rIdx, e.target.value)}
                      placeholder="Leave blank to fall back to the overall rationale…"
                      disabled={disabled}
                      className="auth-input auth-input--sm"
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
          <strong>Rows:</strong> {filledRows}/{rows.length} filled · {MIN_MATRIX_ROWS}–{MAX_MATRIX_ROWS} allowed
        </span>
        <span>
          <strong>Columns:</strong> {filledCols}/{columns.length} filled · {MIN_MATRIX_COLS}–{MAX_MATRIX_COLS} allowed
        </span>
        <span>
          <strong>Correct cells:</strong> {pickedRows}/{filledRows} rows marked
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MatrixPreview — dual-mode preview (private). Renders the grid as
// the student will see it: row labels down, column headers across,
// an empty radio per cell. Answer-key view fills the cell that
// matches `correct[rowId]` for each row with a green tint + filled
// green radio.
// ─────────────────────────────────────────────────────────────

interface MatrixPreviewProps {
  instruction: string;
  stem: string;
  rowLabel: string;
  rows: MatrixEditorRow[];
  columns: MatrixEditorColumn[];
  correct: Record<string, string>;
  viewMode: PreviewViewMode;
  onViewModeChange: (next: PreviewViewMode) => void;
}

export function MatrixPreview({
  instruction,
  stem,
  rowLabel,
  rows,
  columns,
  correct,
  viewMode,
  onViewModeChange,
}: MatrixPreviewProps) {
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
        {instruction.trim() && (
          <p className="auth-preview-instruction">{instruction}</p>
        )}
        <div className="auth-preview-stem">
          {stem.trim() || <span className="auth-preview-placeholder">Stem appears here…</span>}
        </div>
        <div className="auth-matrix-preview-wrap">
          <table className="auth-matrix-preview-table">
            <thead>
              <tr>
                <th className="auth-matrix-preview-corner">
                  {rowLabel.trim() || (
                    <span className="auth-preview-placeholder">Row label…</span>
                  )}
                </th>
                {columns.map((col, cIdx) => (
                  <th key={col.id} className="auth-matrix-preview-col-head">
                    {col.text.trim() || (
                      <span className="auth-preview-placeholder">Col {cIdx + 1}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => (
                <tr key={row.id}>
                  <td className="auth-matrix-preview-row-head">
                    {row.text.trim() || (
                      <span className="auth-preview-placeholder">Row {rIdx + 1}…</span>
                    )}
                  </td>
                  {columns.map((col) => {
                    const isCorrect =
                      viewMode === 'answer-key' && correct[row.id] === col.id;
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
// MatrixEditorBody — two-pane edit + preview body. Mountable anywhere.
// ─────────────────────────────────────────────────────────────

const FORM_ID = 'auth-matrix-form';

export interface MatrixEditorBodyProps {
  initial: MatrixEditorInitial;
  error: string | null;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onDirty?: () => void;
  onErrorDismiss?: () => void;
}

export function MatrixEditorBody({
  initial,
  error,
  pending,
  onSubmit,
  onDirty,
  onErrorDismiss,
}: MatrixEditorBodyProps) {
  const [tab, setTab] = useState<'content' | 'classification' | 'housekeeping'>('content');
  const [clientError, setClientError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<PreviewViewMode>('student');

  const [stem, setStem] = useState(initial.stem);
  const [instruction, setInstruction] = useState(initial.instruction);
  const [rowLabel, setRowLabel] = useState(initial.row_label);
  const [rows, setRows] = useState<MatrixEditorRow[]>(initial.rows);
  const [columns, setColumns] = useState<MatrixEditorColumn[]>(initial.columns);
  const [correct, setCorrect] = useState<Record<string, string>>(initial.correct);
  const [category, setCategory] = useState(initial.client_needs_category);

  const filledRows = rows.filter((r) => r.text.trim().length > 0);
  const filledCols = columns.filter((c) => c.text.trim().length > 0);
  const allFilledRowsPicked =
    filledRows.length > 0 && filledRows.every((r) => correct[r.id]);

  const contentIncomplete =
    !stem.trim() ||
    !rowLabel.trim() ||
    filledRows.length < MIN_MATRIX_ROWS ||
    filledCols.length < MIN_MATRIX_COLS ||
    !allFilledRowsPicked;
  const classificationIncomplete = !category;

  // Live marks for the Housekeeping readout. Per bank-marks-and-scoring §5.2:
  // MATRIX max = count of rows with an assigned correct column. Mirrors the
  // parser's `cells` build (only filled rows with a valid pick survive).
  const liveMarks = filledRows.filter((r) => correct[r.id]).length;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (contentIncomplete) {
      setTab('content');
      setClientError('Fill in the required fields on Content to continue.');
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
    rowLabel: string;
    rows: MatrixEditorRow[];
    columns: MatrixEditorColumn[];
    correct: Record<string, string>;
  }) {
    setRowLabel(next.rowLabel);
    setRows(next.rows);
    setColumns(next.columns);
    setCorrect(next.correct);
  }

  return (
    <form
      id={FORM_ID}
      className="auth-form"
      noValidate
      onSubmit={handleSubmit}
      onInput={onDirty}
    >
      <HiddenItemInputs type="MATRIX" itemId={initial.itemId} surface={initial.surface} />

      <ErrorToast error={error ?? clientError} onDismiss={dismissError} />

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
              <InstructionField value={instruction} onChange={setInstruction} />
              <StemField value={stem} onChange={setStem} />
              <MatrixGrid
                rowLabel={rowLabel}
                rows={rows}
                columns={columns}
                correct={correct}
                disabled={pending}
                onChange={handleGridChange}
              />
              <RationaleFields
                defaultRationale={initial.rationale}
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
                questionType="MATRIX"
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
          <MatrixPreview
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
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// MatrixEditor — default standalone modal host. Same wiring as MCQ.
// ─────────────────────────────────────────────────────────────

export interface MatrixEditorProps {
  initial: MatrixEditorInitial;
  onClose: () => void;
  onSaved?: (result: { item_id: string; created: boolean }) => void;
  onDeleted?: (item_id: string) => void;
}

export function MatrixEditor({ initial, onClose, onSaved, onDeleted }: MatrixEditorProps) {
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
      title={isEdit ? `Edit Matrix — ${initial.itemId}` : 'New Matrix question'}
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
      <MatrixEditorBody
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
