// mynclex/lib/bank/editors/matrix-mr-row-mapper.ts
//
// MATRIX_MR DB-row helpers + initial-shape constructor. Mirror of
// matrix-row-mapper.ts for the self-contained Matrix Multiple Response
// type. Lives in a non-'use client' module so server pages can import
// the type and helpers without crossing the client boundary.
//
// MATRIX_MR rows live in the same table as MCQ/SATA/MATRIX. The schema
// difference is the JSONB shape on `content` and `correct`:
//   - content : { row_label, rows[], columns[] }   (same as MATRIX)
//   - correct : { cells: Record<rowId, columnId[]>, feedback: Record<rowId, text> }
//     — note: cells maps to an ARRAY of column ids (one or more per row).

import type { HousekeepingMode } from '@/lib/bank/atoms/housekeeping-fields';
import {
  DEFAULT_MATRIX_MR_ROWS,
  DEFAULT_MATRIX_MR_COLS,
} from '@/lib/bank/classifications';
import { type McqDbRow, MCQ_ROW_COLUMNS } from './mcq-row-mapper';

// ─────────────────────────────────────────────────────────────
// Editor state shapes — the in-memory rows/columns carry per-row
// feedback + ids alongside the display text. The DB shapes drop
// feedback off the row object — feedback lives in `correct.feedback`
// keyed by row id.
// ─────────────────────────────────────────────────────────────

export interface MatrixMrEditorRow {
  id: string;          // 'r1', 'r2', ...
  text: string;
  feedback: string;
}

export interface MatrixMrEditorColumn {
  id: string;          // 'c1', 'c2', ...
  text: string;
}

// ─────────────────────────────────────────────────────────────
// MatrixMrEditorInitial — initial-value shape the editor accepts.
// `correct` maps rowId -> columnId[] (one or more correct per row).
// ─────────────────────────────────────────────────────────────

export interface MatrixMrEditorInitial {
  itemId: string | null;
  surface: 'admin' | 'tutor';
  mode: HousekeepingMode;
  instruction: string;
  stem: string;
  rationale: string;
  rationale_img: string;
  row_label: string;
  rows: MatrixMrEditorRow[];
  columns: MatrixMrEditorColumn[];
  correct: Record<string, string[]>;    // rowId -> columnId[]
  client_needs_category: string;
  client_needs_subcategory: string;
  nursing_subject: string;
  body_system: string;
  topic: string;
  subtopic: string;
  difficulty: string;
  bloom_level: string;
  tags: string;
  is_published: boolean;
  is_free_sample: boolean;
  is_builder_visible: boolean;
  marks: number;
  shuffle_options: boolean;
  question_ref: string;
  batch_id: string;
}

// MATRIX_MR rows live in the same table as MCQ. The schema-level
// difference is the JSONB shape on `content` (rows/columns) and `correct`
// (cells maps to an array of column ids).
export interface MatrixMrDbRow extends Omit<McqDbRow, 'content' | 'correct'> {
  content: {
    row_label?: string;
    rows?: { id: string; text: string }[];
    columns?: { id: string; text: string }[];
  } | null;
  correct: {
    cells?: Record<string, string[]>;
    feedback?: Record<string, string>;
  } | null;
}

export const MATRIX_MR_ROW_COLUMNS = MCQ_ROW_COLUMNS;

// ─────────────────────────────────────────────────────────────
// Empty initial — used by the bank-list "+ New question" flow.
// Default is a 3×3 grid with no row label and no picks.
// ─────────────────────────────────────────────────────────────

export function emptyMatrixMrInitial(surface: 'admin' | 'tutor'): MatrixMrEditorInitial {
  return {
    itemId: null,
    surface,
    mode: 'standalone',
    instruction: '',
    stem: '',
    rationale: '',
    rationale_img: '',
    row_label: '',
    rows: defaultRows(),
    columns: defaultColumns(),
    correct: {},
    client_needs_category: '',
    client_needs_subcategory: '',
    nursing_subject: '',
    body_system: '',
    topic: '',
    subtopic: '',
    difficulty: '',
    bloom_level: '',
    tags: '',
    is_published: false,
    is_free_sample: false,
    is_builder_visible: true,
    marks: 1,
    shuffle_options: false,
    question_ref: '',
    batch_id: '',
  };
}

function defaultRows(): MatrixMrEditorRow[] {
  return Array.from({ length: DEFAULT_MATRIX_MR_ROWS }, (_, i) => ({
    id: `r${i + 1}`,
    text: '',
    feedback: '',
  }));
}

function defaultColumns(): MatrixMrEditorColumn[] {
  return Array.from({ length: DEFAULT_MATRIX_MR_COLS }, (_, i) => ({
    id: `c${i + 1}`,
    text: '',
  }));
}

// ─────────────────────────────────────────────────────────────
// Row → initial. Reads row_label/rows/columns from row.content and
// correct cells/feedback from row.correct. Defends against a legacy/
// malformed scalar cell value by coercing to an array.
// ─────────────────────────────────────────────────────────────

export function matrixMrRowToInitial(
  row: MatrixMrDbRow,
  surface: 'admin' | 'tutor',
): MatrixMrEditorInitial {
  const rawRows = row.content?.rows ?? [];
  const rawCols = row.content?.columns ?? [];
  const feedbackMap = row.correct?.feedback ?? {};
  const rawCells = row.correct?.cells ?? {};

  const correct: Record<string, string[]> = {};
  for (const [rowId, cols] of Object.entries(rawCells)) {
    correct[rowId] = Array.isArray(cols) ? cols : [cols];
  }

  return {
    itemId: row.item_id,
    surface,
    mode: 'standalone',
    instruction: row.instruction ?? '',
    stem: row.stem ?? '',
    rationale: row.rationale ?? '',
    rationale_img: row.rationale_img ?? '',
    row_label: row.content?.row_label ?? '',
    rows: rawRows.map((r) => ({
      id: r.id,
      text: r.text,
      feedback: feedbackMap[r.id] ?? '',
    })),
    columns: rawCols.map((c) => ({ id: c.id, text: c.text })),
    correct,
    client_needs_category: row.client_needs_category ?? '',
    client_needs_subcategory: row.client_needs_subcategory ?? '',
    nursing_subject: row.nursing_subject ?? '',
    body_system: row.body_system ?? '',
    topic: row.topic ?? '',
    subtopic: row.subtopic ?? '',
    difficulty: row.difficulty ?? '',
    bloom_level: row.bloom_level ?? '',
    tags: (row.tags ?? []).join(', '),
    is_published: row.is_published,
    is_free_sample: row.is_free_sample,
    is_builder_visible: row.is_builder_visible,
    marks: row.marks ?? 1,
    shuffle_options: row.shuffle_options,
    question_ref: row.question_ref ?? '',
    batch_id: row.batch_id ?? '',
  };
}
