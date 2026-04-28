// mynclex/lib/authoring/editors/mcq-row-mapper.ts
//
// MCQ DB-row helpers for the new authoring tree. Server pages and
// server actions import from here; the editor file (mcq-editor.tsx,
// 'use client') re-exports the type for client-side use.
//
// Why this file isn't 'use client':
//   Server Components that import a non-component (function or
//   constant) from a 'use client' module trigger Next.js's
//   client-reference machinery — calling that "function" from a
//   server render fails at runtime in production builds. Keeping
//   the row mapper, the empty-initial helper, and the type in a
//   neutral module means server pages can call them directly
//   without dragging in the client boundary.
//
// Slice 2 ships only MCQ. Subsequent slices add per-type mappers
// alongside their editors.

import { OPTION_LETTERS, DEFAULT_OPTIONS } from '@/lib/bank/classifications';
import type { HousekeepingMode } from '@/lib/authoring/atoms/housekeeping-fields';

// ─────────────────────────────────────────────────────────────
// Initial-value shape the MCQ editor accepts. Defined here (not
// in mcq-editor.tsx) so server-side callers can construct one
// without crossing the 'use client' boundary.
// ─────────────────────────────────────────────────────────────

export interface McqEditorInitial {
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

/** Empty initial for a fresh MCQ. Used by the bank-list-v2 "+ New question" flow. */
export function emptyMcqInitial(surface: 'admin' | 'tutor'): McqEditorInitial {
  return {
    itemId: null,
    surface,
    mode: 'standalone',
    instruction: '',
    stem: '',
    rationale: '',
    rationale_img: '',
    options: defaultOptionRows(),
    correct_id: '',
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
