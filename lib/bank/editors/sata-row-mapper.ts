// mynclex/lib/bank/editors/sata-row-mapper.ts
//
// SATA (Select All That Apply) DB-row helpers + initial-shape
// constructor. Lives in a non-'use client' module so server pages can
// import the type and helpers without crossing the client boundary
// (same pattern as mcq-row-mapper.ts and tf-row-mapper.ts).
//
// SATA shares the same DB columns as MCQ (same table, same shape).
// The differences live only inside the JSONB:
//   - content.options : same as MCQ.
//   - correct.answers : array of option IDs (vs MCQ's single answer).

import { OPTION_LETTERS, DEFAULT_OPTIONS } from '@/lib/bank/classifications';
import type { HousekeepingMode } from '@/lib/bank/atoms/housekeeping-fields';
import { type McqDbRow, MCQ_ROW_COLUMNS } from './mcq-row-mapper';

// ─────────────────────────────────────────────────────────────
// SataEditorInitial — initial-value shape the SATA editor accepts.
// Mirrors McqEditorInitial except `correct_ids` is an array instead
// of a single `correct_id`.
// ─────────────────────────────────────────────────────────────

export interface SataEditorInitial {
  itemId: string | null;
  surface: 'admin' | 'tutor';
  /** Slice 11.15 — origin note when authored from a note's embed flow. */
  parentNoteId?: string | null;
  mode: HousekeepingMode;
  instruction: string;
  stem: string;
  rationale: string;
  rationale_img: string;
  options: { id: string; text: string; feedback: string }[];
  correct_ids: string[];
  client_needs_category: string;
  client_needs_subcategory: string;
  nursing_subject: string;
  body_system: string;
  topic: string;
  subtopic: string;
  difficulty: string;
  difficulty_irt: number | null;
  difficulty_source: string;
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

// SATA rows live in the same table with the same columns as MCQ.
// The only schema-level difference is the JSONB shape on `correct`.
export interface SataDbRow extends Omit<McqDbRow, 'correct'> {
  correct: { answers?: string[]; feedback?: Record<string, string> } | null;
}

export const SATA_ROW_COLUMNS = MCQ_ROW_COLUMNS;

// ─────────────────────────────────────────────────────────────
// Empty initial — used by the bank-list "+ New question" flow.
// ─────────────────────────────────────────────────────────────

export function emptySataInitial(surface: 'admin' | 'tutor'): SataEditorInitial {
  return {
    itemId: null,
    surface,
    mode: 'standalone',
    instruction: '',
    stem: '',
    rationale: '',
    rationale_img: '',
    options: defaultOptionRows(),
    correct_ids: [],
    client_needs_category: '',
    client_needs_subcategory: '',
    nursing_subject: '',
    body_system: '',
    topic: '',
    subtopic: '',
    difficulty: '',
    difficulty_irt: null,
    difficulty_source: 'CURATOR_LABEL',
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

function defaultOptionRows(): { id: string; text: string; feedback: string }[] {
  return Array.from({ length: DEFAULT_OPTIONS }, (_, i) => ({
    id: OPTION_LETTERS[i],
    text: '',
    feedback: '',
  }));
}

// ─────────────────────────────────────────────────────────────
// Row → initial. Reads correct_ids from row.correct.answers.
// ─────────────────────────────────────────────────────────────

export function sataRowToInitial(
  row: SataDbRow,
  surface: 'admin' | 'tutor',
): SataEditorInitial {
  const rawOptions = row.content?.options ?? [];
  const feedbackMap = row.correct?.feedback ?? {};

  return {
    itemId: row.item_id,
    surface,
    mode: 'standalone',
    instruction: row.instruction ?? '',
    stem: row.stem ?? '',
    rationale: row.rationale ?? '',
    rationale_img: row.rationale_img ?? '',
    options: rawOptions.map((o) => ({
      id: o.id,
      text: o.text,
      feedback: feedbackMap[o.id] ?? '',
    })),
    correct_ids: row.correct?.answers ?? [],
    client_needs_category: row.client_needs_category ?? '',
    client_needs_subcategory: row.client_needs_subcategory ?? '',
    nursing_subject: row.nursing_subject ?? '',
    body_system: row.body_system ?? '',
    topic: row.topic ?? '',
    subtopic: row.subtopic ?? '',
    difficulty: row.difficulty ?? '',
    difficulty_irt: row.difficulty_irt ?? null,
    difficulty_source: row.difficulty_source ?? 'CURATOR_LABEL',
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
