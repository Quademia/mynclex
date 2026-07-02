// mynclex/lib/bank/parsers/matrix-mr.ts
//
// Matrix Multiple Response parser — builds a validated { content, correct }
// pair from the raw row/column/correct arrays posted by the authoring form.
// Mirror of parsers/matrix.ts; the difference is per-row cardinality: each
// row may have ONE OR MORE correct columns (Q1: at least one). Runs on the
// server (no 'use client'); invoked by the save-question dispatch.
//
// Validation rules:
//   - row_label non-empty
//   - 2–10 rows, 2–6 columns (bounded, mirrors MATRIX)
//   - every row has non-empty text; every column has non-empty text
//   - every row has >= 1 correct column picked (Q1)
//   - every correct column pointer resolves to an actual column ID
//   - row IDs unique; column IDs unique
//   - duplicate picks within a row are de-duplicated

import {
  MIN_MATRIX_MR_ROWS,
  MAX_MATRIX_MR_ROWS,
  MIN_MATRIX_MR_COLS,
  MAX_MATRIX_MR_COLS,
} from '../classifications';
import type {
  MatrixMrContent,
  MatrixMrCorrect,
  MatrixRow,
  MatrixColumn,
} from '../types';

export interface MatrixMrParseInput {
  row_label: string;
  rowIds: string[];
  rowTexts: string[];
  rowFeedbacks: string[];
  colIds: string[];
  colTexts: string[];
  correctByRow: Record<string, string[]>;  // rowId -> columnId[]
}

export type MatrixMrParseResult =
  | { ok: true; content: MatrixMrContent; correct: MatrixMrCorrect }
  | { ok: false; error: string };

export function parseMatrixMr(input: MatrixMrParseInput): MatrixMrParseResult {
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
  if (rows.length < MIN_MATRIX_MR_ROWS) {
    return { ok: false, error: `At least ${MIN_MATRIX_MR_ROWS} rows with text are required.` };
  }
  if (rows.length > MAX_MATRIX_MR_ROWS) {
    return { ok: false, error: `At most ${MAX_MATRIX_MR_ROWS} rows are allowed.` };
  }
  if (columns.length < MIN_MATRIX_MR_COLS) {
    return { ok: false, error: `At least ${MIN_MATRIX_MR_COLS} columns with text are required.` };
  }
  if (columns.length > MAX_MATRIX_MR_COLS) {
    return { ok: false, error: `At most ${MAX_MATRIX_MR_COLS} columns are allowed.` };
  }

  // Every row must have >= 1 correct column pick, all of which resolve.
  const validColIds = new Set(columns.map((c) => c.id));
  const cells: Record<string, string[]> = {};
  for (const row of rows) {
    const picks = input.correctByRow[row.id] ?? [];
    // De-duplicate while preserving order.
    const seen = new Set<string>();
    const clean: string[] = [];
    for (const raw of picks) {
      const picked = (raw ?? '').trim();
      if (!picked || seen.has(picked)) continue;
      if (!validColIds.has(picked)) {
        return { ok: false, error: `Row "${row.text}" points to an unknown column.` };
      }
      seen.add(picked);
      clean.push(picked);
    }
    if (clean.length === 0) {
      return { ok: false, error: `Row "${row.text}" has no correct column selected.` };
    }
    cells[row.id] = clean;
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
