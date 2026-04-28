// mynclex/lib/authoring/editors/mcq/value.ts
//
// McqEditor's value shape and the read-side parser that converts a
// row from nclex_bank_items into editor state.
//
// Slice 1: read-side only. Save and the inverse parser land in
// Slice 2 in this same module.

import {
  emptyClassification,
  emptyHousekeeping,
  type ClassificationValue,
  type HousekeepingValue,
  type SystemMeta,
} from '../../types';

export interface McqOption {
  id: string; // 'A' | 'B' | 'C' | ...
  text: string;
  correct: boolean;
  // Per-option feedback. Lives in correct.feedback[id] on the row,
  // shown to the student after submit.
  feedback: string;
}

export interface McqValue {
  meta: SystemMeta;
  instruction: string;
  stem: string;
  options: McqOption[];
  rationale: string;
  rationaleImg: string;
  classification: ClassificationValue;
  housekeeping: HousekeepingValue;
}

// Loosely-typed row shape we read from nclex_bank_items. JSONB
// columns are narrowed at parse time. We accept any extra fields
// (parent_case_id, trend_id, etc.) without referencing them — the
// standalone editor is for non-wrapper questions.
export interface BankItemRow {
  item_id: string;
  question_type: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  instruction: string | null;
  stem: string;
  rationale: string | null;
  rationale_img: string | null;
  content: { options?: { id: string; text: string }[] } & Record<string, unknown>;
  correct: { answer?: string; feedback?: Record<string, string> } & Record<string, unknown>;
  client_needs_category: string | null;
  client_needs_subcategory: string | null;
  nursing_subject: string | null;
  body_system: string | null;
  difficulty: string | null;
  topic: string | null;
  subtopic: string | null;
  bloom_level: string | null;
  tags: string[] | null;
  marks: number;
  question_ref: string | null;
  batch_id: string | null;
  is_free_sample: boolean;
  is_builder_visible: boolean;
  shuffle_options: boolean;
}

export function emptyMcq(itemId = ''): McqValue {
  const now = new Date().toISOString();
  return {
    meta: {
      itemId,
      isPublished: false,
      createdAt: now,
      updatedAt: now,
    },
    instruction: '',
    stem: '',
    options: [
      { id: 'A', text: '', correct: false, feedback: '' },
      { id: 'B', text: '', correct: false, feedback: '' },
      { id: 'C', text: '', correct: false, feedback: '' },
      { id: 'D', text: '', correct: false, feedback: '' },
    ],
    rationale: '',
    rationaleImg: '',
    classification: emptyClassification(),
    housekeeping: emptyHousekeeping(),
  };
}

export function rowToMcq(row: BankItemRow): McqValue {
  if (row.question_type !== 'MCQ') {
    throw new Error(`rowToMcq: expected MCQ row, got ${row.question_type}`);
  }

  const rawOptions = row.content.options ?? [];
  const feedbackMap = row.correct.feedback ?? {};
  const correctId = row.correct.answer ?? '';

  return {
    meta: {
      itemId: row.item_id,
      isPublished: row.is_published,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    instruction: row.instruction ?? '',
    stem: row.stem,
    options: rawOptions.map((o) => ({
      id: o.id,
      text: o.text,
      correct: o.id === correctId,
      feedback: feedbackMap[o.id] ?? '',
    })),
    rationale: row.rationale ?? '',
    rationaleImg: row.rationale_img ?? '',
    classification: {
      clientNeedsCategory: row.client_needs_category ?? '',
      clientNeedsSubcategory: row.client_needs_subcategory ?? '',
      nursingSubject: row.nursing_subject ?? '',
      bodySystem: row.body_system ?? '',
      difficulty: row.difficulty ?? '',
      topic: row.topic ?? '',
      subtopic: row.subtopic ?? '',
      bloomLevel: row.bloom_level ?? '',
      tags: (row.tags ?? []).join(', '),
    },
    housekeeping: {
      marks: row.marks,
      questionRef: row.question_ref ?? '',
      batchId: row.batch_id ?? '',
      isFreeSample: row.is_free_sample,
      isBuilderVisible: row.is_builder_visible,
      shuffleOptions: row.shuffle_options,
    },
  };
}
