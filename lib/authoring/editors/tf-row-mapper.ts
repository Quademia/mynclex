// mynclex/lib/authoring/editors/tf-row-mapper.ts
//
// TF (True/False) DB-row helpers + initial-shape constructor.
// Lives in a non-'use client' module so server pages can import the
// type and helpers without crossing the client boundary (same pattern
// as mcq-row-mapper.ts).
//
// TF and MCQ share the same DB columns (same table, same shape) and
// the same form-data contract: option arrays of {id, text, feedback}
// plus a single correct_id. The TF editor locks the text + add/remove
// so the curator only edits feedback + picks correct.

import type { HousekeepingMode } from '@/lib/authoring/atoms/housekeeping-fields';
import {
  type McqDbRow,
  MCQ_ROW_COLUMNS,
} from './mcq-row-mapper';

// ─────────────────────────────────────────────────────────────
// TfEditorInitial — initial-value shape the TF editor accepts.
// Structurally identical to McqEditorInitial today; kept as its own
// type so future divergence (e.g. TF-specific fields) doesn't ripple
// through MCQ and vice-versa.
// ─────────────────────────────────────────────────────────────

export interface TfEditorInitial {
  itemId: string | null;
  surface: 'admin' | 'tutor';
  mode: HousekeepingMode;
  instruction: string;
  stem: string;
  rationale: string;
  rationale_img: string;
  options: { id: string; text: string; feedback: string }[];
  correct_id: string;
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

// ─────────────────────────────────────────────────────────────
// Fixed True/False option list — locked everywhere TF is rendered
// or persisted. The legacy parser (lib/bank/parsers/tf.ts) rejects
// anything that doesn't match this exact shape.
// ─────────────────────────────────────────────────────────────

export const TF_FIXED_OPTIONS = [
  { id: 'A', text: 'True' },
  { id: 'B', text: 'False' },
] as const;

// Re-exported for symmetry with MCQ. TF and MCQ rows live in the same
// table with the same columns; importers can use either alias.
export type TfDbRow = McqDbRow;
export const TF_ROW_COLUMNS = MCQ_ROW_COLUMNS;

// ─────────────────────────────────────────────────────────────
// Empty initial — used by the bank-list-v2 "+ New question" flow
// when TF is picked. Defaults the correct answer to True.
// ─────────────────────────────────────────────────────────────

export function emptyTfInitial(surface: 'admin' | 'tutor'): TfEditorInitial {
  return {
    itemId: null,
    surface,
    mode: 'standalone',
    instruction: '',
    stem: '',
    rationale: '',
    rationale_img: '',
    options: TF_FIXED_OPTIONS.map((o) => ({
      id: o.id,
      text: o.text,
      feedback: '',
    })),
    correct_id: 'A',
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
    shuffle_options: true,
    question_ref: '',
    batch_id: '',
  };
}

// ─────────────────────────────────────────────────────────────
// Row → initial. Reads the TF options from row.content but always
// fills in fresh True/False text and IDs from TF_FIXED_OPTIONS so
// the locked-shape contract holds even if the row drifts.
// ─────────────────────────────────────────────────────────────

export function tfRowToInitial(
  row: TfDbRow,
  surface: 'admin' | 'tutor',
): TfEditorInitial {
  const feedbackMap = row.correct?.feedback ?? {};

  return {
    itemId: row.item_id,
    surface,
    mode: 'standalone',
    instruction: row.instruction ?? '',
    stem: row.stem ?? '',
    rationale: row.rationale ?? '',
    rationale_img: row.rationale_img ?? '',
    options: TF_FIXED_OPTIONS.map((o) => ({
      id: o.id,
      text: o.text,
      feedback: feedbackMap[o.id] ?? '',
    })),
    correct_id: row.correct?.answer ?? 'A',
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
