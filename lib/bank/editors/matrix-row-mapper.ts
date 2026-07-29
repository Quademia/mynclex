// mynclex/lib/bank/editors/matrix-row-mapper.ts
//
// MATRIX DB-row helpers + initial-shape constructor. Lives in a
// non-'use client' module so server pages can import the type and
// helpers without crossing the client boundary.
//
// MATRIX rows live in the same table as MCQ/SATA/SELECT_N. The schema
// difference is the JSONB shape on `content` and `correct`:
//   - content : { row_label, rows[], columns[] }
//   - correct : { cells: Record<rowId, columnId>, feedback: Record<rowId, text> }

import type { HousekeepingMode } from '@/lib/bank/atoms/housekeeping-fields';
import {
  DEFAULT_MATRIX_ROWS,
  DEFAULT_MATRIX_COLS,
} from '@/lib/bank/classifications';
import { type McqDbRow, MCQ_ROW_COLUMNS } from './mcq-row-mapper';

// ─────────────────────────────────────────────────────────────
// Editor state shapes — the in-memory rows/columns the editor renders
// carry per-row feedback + ids alongside the display text. The DB
// shapes (in lib/bank/types.ts) drop feedback off the row object
// — feedback lives in `correct.feedback` keyed by row id.
// ─────────────────────────────────────────────────────────────

export interface MatrixEditorRow {
  id: string;          // 'r1', 'r2', ...
  text: string;
  feedback: string;
}

export interface MatrixEditorColumn {
  id: string;          // 'c1', 'c2', ...
  text: string;
}

// ─────────────────────────────────────────────────────────────
// MatrixEditorInitial — initial-value shape the MATRIX editor accepts.
// ─────────────────────────────────────────────────────────────

export interface MatrixEditorInitial {
  itemId: string | null;
  surface: 'admin' | 'tutor';
  mode: HousekeepingMode;
  instruction: string;
  stem: string;
  rationale: string;
  rationale_img: string;
  row_label: string;
  rows: MatrixEditorRow[];
  columns: MatrixEditorColumn[];
  correct: Record<string, string>;     // rowId -> columnId
  client_needs_category: string;
  client_needs_subcategory: string;
  nursing_subject: string;
  body_system: string;
  topic: string;
  subtopic: string;
  difficulty: string;
  difficulty_irt: number | null;
  difficulty_source: string;
  cat_pool: boolean;
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

// MATRIX rows live in the same table as MCQ. The schema-level difference
// is the JSONB shape on `content` (rows/columns) and `correct` (cells).
export interface MatrixDbRow extends Omit<McqDbRow, 'content' | 'correct'> {
  content: {
    row_label?: string;
    rows?: { id: string; text: string }[];
    columns?: { id: string; text: string }[];
  } | null;
  correct: {
    cells?: Record<string, string>;
    feedback?: Record<string, string>;
  } | null;
}

export const MATRIX_ROW_COLUMNS = MCQ_ROW_COLUMNS;

// ─────────────────────────────────────────────────────────────
// Empty initial — used by the bank-list "+ New question" flow.
// Default is a 3×3 grid with no row label and no picks.
// ─────────────────────────────────────────────────────────────

export function emptyMatrixInitial(surface: 'admin' | 'tutor'): MatrixEditorInitial {
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
    difficulty_irt: null,
    difficulty_source: 'CURATOR_LABEL',
    cat_pool: false,
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

function defaultRows(): MatrixEditorRow[] {
  return Array.from({ length: DEFAULT_MATRIX_ROWS }, (_, i) => ({
    id: `r${i + 1}`,
    text: '',
    feedback: '',
  }));
}

function defaultColumns(): MatrixEditorColumn[] {
  return Array.from({ length: DEFAULT_MATRIX_COLS }, (_, i) => ({
    id: `c${i + 1}`,
    text: '',
  }));
}

// ─────────────────────────────────────────────────────────────
// Row → initial. Reads row_label/rows/columns from row.content and
// correct cells/feedback from row.correct.
// ─────────────────────────────────────────────────────────────

export function matrixRowToInitial(
  row: MatrixDbRow,
  surface: 'admin' | 'tutor',
): MatrixEditorInitial {
  const rawRows = row.content?.rows ?? [];
  const rawCols = row.content?.columns ?? [];
  const feedbackMap = row.correct?.feedback ?? {};

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
    correct: { ...(row.correct?.cells ?? {}) },
    client_needs_category: row.client_needs_category ?? '',
    client_needs_subcategory: row.client_needs_subcategory ?? '',
    nursing_subject: row.nursing_subject ?? '',
    body_system: row.body_system ?? '',
    topic: row.topic ?? '',
    subtopic: row.subtopic ?? '',
    difficulty: row.difficulty ?? '',
    difficulty_irt: row.difficulty_irt ?? null,
    difficulty_source: row.difficulty_source ?? 'CURATOR_LABEL',
    cat_pool: row.cat_pool ?? false,
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
