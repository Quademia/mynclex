// mynclex/lib/bank/editors/matrix-editor.tsx
//
// Matrix authoring grid. The editor mirrors the student view one-for-one —
// curator builds on the same rows × columns grid the student will answer.
//
// FormData contract (all fields are `name=` attributes):
//   matrix_row_label        — the editable top-left corner text
//   matrix_row_id           — one per row, in order (e.g. r1, r2, ...)
//   matrix_row_text         — one per row, matching order
//   matrix_row_feedback     — one per row, matching order (may be empty)
//   matrix_col_id           — one per column, in order
//   matrix_col_text         — one per column, matching order
//   matrix_correct_<rowId>  — the chosen columnId for that row (radio name)

'use client';

import { Fragment, useState } from 'react';
import {
  MIN_MATRIX_ROWS,
  MAX_MATRIX_ROWS,
  MIN_MATRIX_COLS,
  MAX_MATRIX_COLS,
} from '../classifications';
import { makePrefixer } from '../field-prefix';

interface RowRow {
  id: string;
  text: string;
  feedback: string;
}

interface ColRow {
  id: string;
  text: string;
}

export function MatrixEditor({
  initialRowLabel,
  initialRows,
  initialColumns,
  initialCorrect,
  fieldPrefix = '',
}: {
  initialRowLabel: string;
  initialRows: RowRow[];
  initialColumns: ColRow[];
  initialCorrect: Record<string, string>;
  fieldPrefix?: string;
}) {
  const fn = makePrefixer(fieldPrefix);
  const [rowLabel, setRowLabel] = useState<string>(
    initialRowLabel || '',
  );
  const [rows, setRows] = useState<RowRow[]>(() =>
    initialRows.length > 0 ? initialRows : defaultRows(),
  );
  const [columns, setColumns] = useState<ColRow[]>(() =>
    initialColumns.length > 0 ? initialColumns : defaultColumns(),
  );
  const [correct, setCorrect] = useState<Record<string, string>>(
    initialCorrect ?? {},
  );

  function nextRowId(): string {
    // Find the lowest unused r<N>.
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

  function addRow() {
    if (rows.length >= MAX_MATRIX_ROWS) return;
    setRows([...rows, { id: nextRowId(), text: '', feedback: '' }]);
  }

  function removeRow(idx: number) {
    if (rows.length <= MIN_MATRIX_ROWS) return;
    const removedId = rows[idx].id;
    setRows(rows.filter((_, i) => i !== idx));
    if (correct[removedId]) {
      const next = { ...correct };
      delete next[removedId];
      setCorrect(next);
    }
  }

  function updateRowText(idx: number, text: string) {
    setRows(rows.map((r, i) => (i === idx ? { ...r, text } : r)));
  }

  function updateRowFeedback(idx: number, feedback: string) {
    setRows(rows.map((r, i) => (i === idx ? { ...r, feedback } : r)));
  }

  function addColumn() {
    if (columns.length >= MAX_MATRIX_COLS) return;
    setColumns([...columns, { id: nextColId(), text: '' }]);
  }

  function removeColumn(idx: number) {
    if (columns.length <= MIN_MATRIX_COLS) return;
    const removedId = columns[idx].id;
    setColumns(columns.filter((_, i) => i !== idx));
    // Clear any row that had this column marked correct
    const next: Record<string, string> = {};
    for (const [rowId, colId] of Object.entries(correct)) {
      if (colId !== removedId) next[rowId] = colId;
    }
    setCorrect(next);
  }

  function updateColText(idx: number, text: string) {
    setColumns(columns.map((c, i) => (i === idx ? { ...c, text } : c)));
  }

  function pickCorrect(rowId: string, colId: string) {
    setCorrect({ ...correct, [rowId]: colId });
  }

  return (
    <div className="bank-fg">
      <div className="bank-label-row">
        <label className="bank-label">Matrix grid *</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="bank-link-btn"
            onClick={addRow}
            disabled={rows.length >= MAX_MATRIX_ROWS}
          >
            + Add row
          </button>
          <button
            type="button"
            className="bank-link-btn"
            onClick={addColumn}
            disabled={columns.length >= MAX_MATRIX_COLS}
          >
            + Add column
          </button>
        </div>
      </div>
      <p className="bank-hint">
        Click a radio in each row to mark the correct column. Per-row feedback
        is optional; blank rows fall back to the overall rationale.
      </p>

      {/* Hidden input for the row-axis label */}
      <input type="hidden" name={fn('matrix_row_label')} value={rowLabel} />

      <div className="bank-matrix-wrap">
        <table className="bank-matrix-table">
          <thead>
            <tr>
              <th className="bank-matrix-corner">
                <input
                  type="text"
                  value={rowLabel}
                  onChange={(e) => setRowLabel(e.target.value)}
                  placeholder="e.g. Finding, Medication…"
                  className="bank-matrix-corner-input"
                />
              </th>
              {columns.map((col, cIdx) => (
                <th key={col.id} className="bank-matrix-col-head">
                  <input
                    type="text"
                    value={col.text}
                    onChange={(e) => updateColText(cIdx, e.target.value)}
                    placeholder={`Col ${cIdx + 1}`}
                    className="bank-matrix-col-input"
                  />
                  <input type="hidden" name={fn('matrix_col_id')} value={col.id} />
                  <input type="hidden" name={fn('matrix_col_text')} value={col.text} />
                  <button
                    type="button"
                    className="bank-matrix-col-remove"
                    onClick={() => removeColumn(cIdx)}
                    disabled={columns.length <= MIN_MATRIX_COLS}
                    title="Remove column"
                  >
                    ✕
                  </button>
                </th>
              ))}
              <th className="bank-matrix-row-actions" aria-hidden="true"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <Fragment key={row.id}>
                <tr>
                  <td className="bank-matrix-row-head">
                    <input
                      type="text"
                      value={row.text}
                      onChange={(e) => updateRowText(rIdx, e.target.value)}
                      placeholder={`Row ${rIdx + 1} text…`}
                      className="bank-matrix-row-input"
                    />
                    <input type="hidden" name={fn('matrix_row_id')} value={row.id} />
                    <input type="hidden" name={fn('matrix_row_text')} value={row.text} />
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className="bank-matrix-cell"
                    >
                      <input
                        type="radio"
                        name={fn(`matrix_correct_${row.id}`)}
                        value={col.id}
                        checked={correct[row.id] === col.id}
                        onChange={() => pickCorrect(row.id, col.id)}
                        title={`Mark ${col.text || 'this column'} correct for this row`}
                      />
                    </td>
                  ))}
                  <td className="bank-matrix-row-actions">
                    <button
                      type="button"
                      className="bank-row-remove"
                      onClick={() => removeRow(rIdx)}
                      disabled={rows.length <= MIN_MATRIX_ROWS}
                      title="Remove row"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
                <tr className="bank-matrix-feedback-row">
                  <td colSpan={columns.length + 2}>
                    <label className="bank-matrix-feedback-label">
                      Feedback for this row (optional)
                    </label>
                    <input
                      type="text"
                      name={fn('matrix_row_feedback')}
                      value={row.feedback}
                      onChange={(e) => updateRowFeedback(rIdx, e.target.value)}
                      placeholder="Leave blank to fall back to the overall rationale…"
                      className="bank-input bank-input--sm"
                    />
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bank-matrix-bounds">
        <span>
          <strong>Rows:</strong> {rows.length} of {MIN_MATRIX_ROWS}–{MAX_MATRIX_ROWS}
        </span>
        <span>
          <strong>Columns:</strong> {columns.length} of {MIN_MATRIX_COLS}–{MAX_MATRIX_COLS}
        </span>
        <span>
          <strong>Correct cells:</strong>{' '}
          {rows.filter((r) => correct[r.id]).length} of {rows.length} rows marked
        </span>
      </div>
    </div>
  );
}

function defaultRows(): RowRow[] {
  return [
    { id: 'r1', text: '', feedback: '' },
    { id: 'r2', text: '', feedback: '' },
    { id: 'r3', text: '', feedback: '' },
  ];
}

function defaultColumns(): ColRow[] {
  return [
    { id: 'c1', text: '' },
    { id: 'c2', text: '' },
    { id: 'c3', text: '' },
  ];
}
