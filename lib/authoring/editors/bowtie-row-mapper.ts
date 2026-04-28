// mynclex/lib/authoring/editors/bowtie-row-mapper.ts
//
// BOWTIE DB-row helpers + initial-shape constructor. Lives in a
// non-'use client' module so server pages can import the type and
// helpers without crossing the client boundary.
//
// BOWTIE rows live in the same table as MCQ. The schema-level difference
// is the JSONB shape on `content` and `correct`:
//   - content : { left: {label, tokens[]}, centre: {…}, right: {…} }
//   - correct : { left: string[], centre: string, right: string[], feedback }
//
// Token IDs are prefixed (lt1/lt2…, ct1/ct2…, rt1/rt2…) so the flat
// feedback map can disambiguate without clashing.

import type { HousekeepingMode } from '@/lib/authoring/atoms/housekeeping-fields';
import { type McqDbRow, MCQ_ROW_COLUMNS } from './mcq-row-mapper';

// ─────────────────────────────────────────────────────────────
// Editor state shapes — `correct` lives on the token row in editor
// state (matches the legacy editor + makes the form-data emission
// trivial: we only emit a "I am correct" hidden input for tokens
// where token.correct === true).
// ─────────────────────────────────────────────────────────────

export interface BowtieEditorToken {
  id: string;          // 'lt1', 'ct1', 'rt1', ...
  text: string;
  feedback: string;
  correct: boolean;
}

// ─────────────────────────────────────────────────────────────
// BowtieEditorInitial — initial-value shape the BOWTIE editor accepts.
// ─────────────────────────────────────────────────────────────

export interface BowtieEditorInitial {
  itemId: string | null;
  surface: 'admin' | 'tutor';
  mode: HousekeepingMode;
  instruction: string;
  stem: string;
  rationale: string;
  rationale_img: string;
  left_label: string;
  left_tokens: BowtieEditorToken[];
  centre_label: string;
  centre_tokens: BowtieEditorToken[];
  right_label: string;
  right_tokens: BowtieEditorToken[];
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

// BOWTIE rows live in the same table as MCQ. The schema-level difference
// is the JSONB shape on `content` and `correct`.
export interface BowtieDbRow extends Omit<McqDbRow, 'content' | 'correct'> {
  content: {
    left?:   { label?: string; tokens?: { id: string; text: string }[] };
    centre?: { label?: string; tokens?: { id: string; text: string }[] };
    right?:  { label?: string; tokens?: { id: string; text: string }[] };
  } | null;
  correct: {
    left?:     string[];
    centre?:   string;
    right?:    string[];
    feedback?: Record<string, string>;
  } | null;
}

export const BOWTIE_ROW_COLUMNS = MCQ_ROW_COLUMNS;

// ─────────────────────────────────────────────────────────────
// Default labels — shown to the curator on first creation.
// Match the legacy editor's defaults so behaviour is consistent.
// ─────────────────────────────────────────────────────────────

const DEFAULT_LEFT_LABEL   = 'Actions to take';
const DEFAULT_CENTRE_LABEL = 'Condition';
const DEFAULT_RIGHT_LABEL  = 'Parameters to monitor';

// ─────────────────────────────────────────────────────────────
// Empty initial — used by the bank-list-v2 "+ New question" flow.
// Default tokens: 3 / 2 / 3 (left / centre / right), all blank,
// none marked correct. Curator fills text + ticks correct picks.
// ─────────────────────────────────────────────────────────────

export function emptyBowtieInitial(surface: 'admin' | 'tutor'): BowtieEditorInitial {
  return {
    itemId: null,
    surface,
    mode: 'standalone',
    instruction: '',
    stem: '',
    rationale: '',
    rationale_img: '',
    left_label: DEFAULT_LEFT_LABEL,
    left_tokens: defaultTokens('lt', 3),
    centre_label: DEFAULT_CENTRE_LABEL,
    centre_tokens: defaultTokens('ct', 2),
    right_label: DEFAULT_RIGHT_LABEL,
    right_tokens: defaultTokens('rt', 3),
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

function defaultTokens(prefix: 'lt' | 'ct' | 'rt', count: number): BowtieEditorToken[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i + 1}`,
    text: '',
    feedback: '',
    correct: false,
  }));
}

// ─────────────────────────────────────────────────────────────
// Row → initial. Reads labels + tokens per wing from row.content
// and folds correct picks + feedback in from row.correct.
// ─────────────────────────────────────────────────────────────

export function bowtieRowToInitial(
  row: BowtieDbRow,
  surface: 'admin' | 'tutor',
): BowtieEditorInitial {
  const feedbackMap = row.correct?.feedback ?? {};
  const leftCorrect = new Set(row.correct?.left ?? []);
  const rightCorrect = new Set(row.correct?.right ?? []);
  const centreCorrect = row.correct?.centre ?? '';

  function hydrateTokens(
    raw: { id: string; text: string }[] | undefined,
    correctSet: Set<string>,
  ): BowtieEditorToken[] {
    return (raw ?? []).map((t) => ({
      id: t.id,
      text: t.text,
      feedback: feedbackMap[t.id] ?? '',
      correct: correctSet.has(t.id),
    }));
  }

  return {
    itemId: row.item_id,
    surface,
    mode: 'standalone',
    instruction: row.instruction ?? '',
    stem: row.stem ?? '',
    rationale: row.rationale ?? '',
    rationale_img: row.rationale_img ?? '',
    left_label: row.content?.left?.label ?? '',
    left_tokens: hydrateTokens(row.content?.left?.tokens, leftCorrect),
    centre_label: row.content?.centre?.label ?? '',
    centre_tokens: hydrateTokens(
      row.content?.centre?.tokens,
      new Set(centreCorrect ? [centreCorrect] : []),
    ),
    right_label: row.content?.right?.label ?? '',
    right_tokens: hydrateTokens(row.content?.right?.tokens, rightCorrect),
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
