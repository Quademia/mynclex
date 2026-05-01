// mynclex/lib/authoring/parsers/matrix.ts
//
// Matrix parser — builds a validated { content, correct } pair from the
// raw row/column/correct arrays posted by the authoring form. Runs on
// the server (no 'use client'); invoked by the save-question dispatch.
//
// Validation rules:
//   - row_label non-empty
//   - 2–6 rows, 2–6 columns (bounded)
//   - every row has non-empty text; every column has non-empty text
//   - every row has a correct column picked
//   - every correct column pointer resolves to an actual column ID
//   - row IDs unique; column IDs unique

import {
  MIN_MATRIX_ROWS,
  MAX_MATRIX_ROWS,
  MIN_MATRIX_COLS,
  MAX_MATRIX_COLS,
} from '../classifications';
import type {
  MatrixContent,
  MatrixCorrect,
  MatrixRow,
  MatrixColumn,
} from '../types';

export interface MatrixParseInput {
  row_label: string;
  rowIds: string[];
  rowTexts: string[];
  rowFeedbacks: string[];
  colIds: string[];
  colTexts: string[];
  correctByRow: Record<string, string>;  // rowId -> columnId
}

export type MatrixParseResult =
  | { ok: true; content: MatrixContent; correct: MatrixCorrect }
  | { ok: false; error: string };

export function parseMatrix(input: MatrixParseInput): MatrixParseResult {
  const rowLabel = (input.row_label ?? '').trim();
  if (!rowLabel) {
    return { ok: false, error: 'Row-axis label is required (e.g. "Finding", "Medication").' };
  }

  // Arrays must be aligned
  if (
    input.rowIds.length !== input.rowTexts.length ||
    input.rowIds.length !== input.rowFeedbacks.length
  ) {
    return { ok: false, error: 'Row arrays out of sync.' };
  }
  if (input.colIds.length !== input.colTexts.length) {
    return { ok: false, error: 'Column arrays out of sync.' };
  }

  // Build rows, skip fully-empty rows (curator may have drafted extras)
  const rows: MatrixRow[] = [];
  const feedback: Record<string, string> = {};
  const seenRowIds = new Set<string>();
  for (let i = 0; i < input.rowIds.length; i++) {
    const id = input.rowIds[i].trim();
    const text = input.rowTexts[i].trim();
    if (!id || !text) continue;
    if (seenRowIds.has(id)) {
      return { ok: false, error: `Duplicate row ID "${id}".` };
    }
    seenRowIds.add(id);
    rows.push({ id, text });
    const fb = input.rowFeedbacks[i].trim();
    if (fb) feedback[id] = fb;
  }

  // Build columns
  const columns: MatrixColumn[] = [];
  const seenColIds = new Set<string>();
  for (let i = 0; i < input.colIds.length; i++) {
    const id = input.colIds[i].trim();
    const text = input.colTexts[i].trim();
    if (!id || !text) continue;
    if (seenColIds.has(id)) {
      return { ok: false, error: `Duplicate column ID "${id}".` };
    }
    seenColIds.add(id);
    columns.push({ id, text });
  }

  // Bounds
  if (rows.length < MIN_MATRIX_ROWS) {
    return { ok: false, error: `At least ${MIN_MATRIX_ROWS} rows with text are required.` };
  }
  if (rows.length > MAX_MATRIX_ROWS) {
    return { ok: false, error: `At most ${MAX_MATRIX_ROWS} rows are allowed.` };
  }
  if (columns.length < MIN_MATRIX_COLS) {
    return { ok: false, error: `At least ${MIN_MATRIX_COLS} columns with text are required.` };
  }
  if (columns.length > MAX_MATRIX_COLS) {
    return { ok: false, error: `At most ${MAX_MATRIX_COLS} columns are allowed.` };
  }

  // Every row must have a correct column pick, and it must resolve.
  const validColIds = new Set(columns.map((c) => c.id));
  const cells: Record<string, string> = {};
  for (const row of rows) {
    const picked = (input.correctByRow[row.id] ?? '').trim();
    if (!picked) {
      return { ok: false, error: `Row "${row.text}" has no correct column selected.` };
    }
    if (!validColIds.has(picked)) {
      return { ok: false, error: `Row "${row.text}" points to an unknown column.` };
    }
    cells[row.id] = picked;
  }

  // Clean feedback: only keep keys that match surviving rows.
  const cleanFeedback: Record<string, string> = {};
  for (const row of rows) {
    if (feedback[row.id]) cleanFeedback[row.id] = feedback[row.id];
  }

  return {
    ok: true,
    content: { row_label: rowLabel, rows, columns },
    correct: { cells, feedback: cleanFeedback },
  };
}
