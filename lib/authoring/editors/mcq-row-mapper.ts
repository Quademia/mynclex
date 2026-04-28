// mynclex/lib/authoring/editors/mcq-row-mapper.ts
//
// Maps a DB row from nclex_bank_items / nclex_tutor_questions into
// McqEditorInitial. Lives in its own file (not in mcq-editor.tsx)
// because the editor is a 'use client' module — putting plain
// server-side helpers there would force any caller into a client
// context.
//
// Slice 2 ships only MCQ. Subsequent slices add per-type mappers
// alongside their editors.

import type { McqEditorInitial } from './mcq-editor';

export interface McqDbRow {
  item_id: string;
  question_type: string;
  stem: string | null;
  instruction: string | null;
  rationale: string | null;
  rationale_img: string | null;
  content: { options?: { id: string; text: string }[] } | null;
  correct: { answer?: string; feedback?: Record<string, string> } | null;
  client_needs_category: string | null;
  client_needs_subcategory: string | null;
  nursing_subject: string | null;
  body_system: string | null;
  topic: string | null;
  subtopic: string | null;
  difficulty: string | null;
  bloom_level: string | null;
  tags: string[] | null;
  is_published: boolean;
  is_free_sample: boolean;
  is_builder_visible: boolean;
  marks: number | null;
  shuffle_options: boolean;
  question_ref: string | null;
  batch_id: string | null;
}

/** The minimum SELECT column list the page query needs to feed this mapper. */
export const MCQ_ROW_COLUMNS =
  'item_id, question_type, stem, instruction, rationale, rationale_img, ' +
  'content, correct, client_needs_category, client_needs_subcategory, ' +
  'nursing_subject, body_system, topic, subtopic, difficulty, bloom_level, ' +
  'tags, is_published, is_free_sample, is_builder_visible, marks, ' +
  'shuffle_options, question_ref, batch_id';

export function mcqRowToInitial(
  row: McqDbRow,
  surface: 'admin' | 'tutor',
): McqEditorInitial {
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
    correct_id: row.correct?.answer ?? '',
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
