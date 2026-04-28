// mynclex/lib/authoring/editors/select-n-row-mapper.ts
//
// SELECT_N (Select Exactly N) DB-row helpers + initial-shape
// constructor. Lives in a non-'use client' module so server pages can
// import the type and helpers without crossing the client boundary
// (same pattern as the other row mappers).
//
// SELECT_N shares the same DB columns as MCQ/SATA. The differences
// live inside the JSONB:
//   - content.options       : same as SATA.
//   - content.select_count  : exactly how many to pick (1..options.length).
//   - correct.answers       : array of length === select_count.

import { OPTION_LETTERS, DEFAULT_OPTIONS } from '@/lib/authoring/classifications';
import type { HousekeepingMode } from '@/lib/authoring/atoms/housekeeping-fields';
import { type McqDbRow, MCQ_ROW_COLUMNS } from './mcq-row-mapper';

const DEFAULT_SELECT_COUNT = 2;

// ─────────────────────────────────────────────────────────────
// SelectNEditorInitial — initial-value shape the SELECT_N editor
// accepts. Mirrors SATA's shape plus `select_count`.
// ─────────────────────────────────────────────────────────────

export interface SelectNEditorInitial {
  itemId: string | null;
  surface: 'admin' | 'tutor';
  mode: HousekeepingMode;
  instruction: string;
  stem: string;
  rationale: string;
  rationale_img: string;
  options: { id: string; text: string; feedback: string }[];
  correct_ids: string[];
  select_count: number;
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

// SELECT_N rows live in the same table as MCQ/SATA. The schema-level
// difference is the JSONB shape on `content` (carries `select_count`)
// and `correct` (array of answers).
export interface SelectNDbRow extends Omit<McqDbRow, 'content' | 'correct'> {
  content: {
    options?: { id: string; text: string }[];
    select_count?: number;
  } | null;
  correct: { answers?: string[]; feedback?: Record<string, string> } | null;
}

export const SELECT_N_ROW_COLUMNS = MCQ_ROW_COLUMNS;

// ─────────────────────────────────────────────────────────────
// Empty initial — used by the bank-list-v2 "+ New question" flow.
// Defaults select_count to 2.
// ─────────────────────────────────────────────────────────────

export function emptySelectNInitial(surface: 'admin' | 'tutor'): SelectNEditorInitial {
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
    select_count: DEFAULT_SELECT_COUNT,
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

function defaultOptionRows(): { id: string; text: string; feedback: string }[] {
  return Array.from({ length: DEFAULT_OPTIONS }, (_, i) => ({
    id: OPTION_LETTERS[i],
    text: '',
    feedback: '',
  }));
}

// ─────────────────────────────────────────────────────────────
// Row → initial. Reads correct_ids from row.correct.answers and
// select_count from row.content.select_count.
// ─────────────────────────────────────────────────────────────

export function selectNRowToInitial(
  row: SelectNDbRow,
  surface: 'admin' | 'tutor',
): SelectNEditorInitial {
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
    select_count: row.content?.select_count ?? DEFAULT_SELECT_COUNT,
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
