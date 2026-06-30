// mynclex/lib/bank/editors/highlight-row-mapper.ts
//
// HIGHLIGHT DB-row helpers + initial-shape constructor. Lives in a
// non-'use client' module so server pages can import the type and
// helpers without crossing the client boundary.
//
// HIGHLIGHT rows live in the same table as MCQ. The schema-level
// difference is the JSONB shape on `content` and `correct`:
//   - content : { chunks: [ { id, text } ] }
//   - correct : { correct_ids: string[], feedback: { [chunkId]: text } }
//
// IDs are 'h1', 'h2', … assigned in passage order by parseHighlight.

import type { HousekeepingMode } from '@/lib/bank/atoms/housekeeping-fields';
import {
  parseRichDoc,
  EMPTY_RICH_DOC,
  type RichDoc,
} from '@/lib/authoring/rich-doc';
import { type McqDbRow, MCQ_ROW_COLUMNS } from './mcq-row-mapper';

// ─────────────────────────────────────────────────────────────
// Editor state shape — what the React component holds in useState.
// `in_passage` flags whether this chunk's text still appears in the
// stem (within [[…]]). Orphans (in_passage=false) are dropped on save
// but kept in editor state so re-typing the bracketed text restores
// them.
// ─────────────────────────────────────────────────────────────

export type HighlightDecision = 'correct' | 'wrong' | 'undecided';

export interface HighlightEditorChunk {
  id: string;            // 'h1', 'h2', ...
  // Chunk text stays PLAIN — it's the clickable token the runner styles, and
  // the decoupled-marker rule keeps it mark-free (Slice 6e decision). Feedback
  // is rich: it shows in the review feedback prose, real formatted HTML.
  text: string;          // text between [[ and ]]
  decision: HighlightDecision;
  feedback: RichDoc;
  in_passage: boolean;
}

// ─────────────────────────────────────────────────────────────
// HighlightEditorInitial — initial-value shape the editor accepts.
// ─────────────────────────────────────────────────────────────

export interface HighlightEditorInitial {
  itemId: string | null;
  surface: 'admin' | 'tutor';
  mode: HousekeepingMode;
  instruction: string;
  stem: string;
  rationale: string;
  rationale_img: string;
  chunks: HighlightEditorChunk[];
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

// HIGHLIGHT rows live in the same table as MCQ. The schema-level
// difference is the JSONB shape on `content` and `correct`.
export interface HighlightDbRow extends Omit<McqDbRow, 'content' | 'correct'> {
  content: {
    chunks?: { id: string; text: string }[];
  } | null;
  correct: {
    correct_ids?: string[];
    feedback?: Record<string, string>;
  } | null;
}

export const HIGHLIGHT_ROW_COLUMNS = MCQ_ROW_COLUMNS;

// ─────────────────────────────────────────────────────────────
// Empty initial — pre-seeds the stem with three placeholder
// `[[finding N]]` brackets and matching active chunks. This makes
// the bracket syntax visible and satisfies the min-3 rule from
// open. The curator replaces the placeholders as they write the
// real passage.
// ─────────────────────────────────────────────────────────────

const SEED_TEXTS = ['finding 1', 'finding 2', 'finding 3'];

export function emptyHighlightInitial(surface: 'admin' | 'tutor'): HighlightEditorInitial {
  const stem = SEED_TEXTS.map((t) => `[[${t}]]`).join(' ');
  const chunks: HighlightEditorChunk[] = SEED_TEXTS.map((t, i) => ({
    id: `h${i + 1}`,
    text: t,
    decision: 'undecided',
    feedback: { ...EMPTY_RICH_DOC },
    in_passage: true,
  }));

  return {
    itemId: null,
    surface,
    mode: 'standalone',
    instruction: '',
    stem,
    rationale: '',
    rationale_img: '',
    chunks,
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

// ─────────────────────────────────────────────────────────────
// Row → initial. Reads the chunks array from row.content, folds in
// correct decisions from row.correct.correct_ids, and per-chunk
// feedback from row.correct.feedback. Every loaded chunk is in_passage
// (the row was saved with that bracketed span present).
// ─────────────────────────────────────────────────────────────

export function highlightRowToInitial(
  row: HighlightDbRow,
  surface: 'admin' | 'tutor',
): HighlightEditorInitial {
  const correctSet = new Set(row.correct?.correct_ids ?? []);
  const feedbackMap = row.correct?.feedback ?? {};

  const chunks: HighlightEditorChunk[] = (row.content?.chunks ?? []).map((c) => ({
    id: c.id,
    text: c.text,
    decision: correctSet.has(c.id) ? 'correct' : 'wrong',
    feedback: parseRichDoc(feedbackMap[c.id] ?? ''),
    in_passage: true,
  }));

  return {
    itemId: row.item_id,
    surface,
    mode: 'standalone',
    instruction: row.instruction ?? '',
    stem: row.stem ?? '',
    rationale: row.rationale ?? '',
    rationale_img: row.rationale_img ?? '',
    chunks,
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
