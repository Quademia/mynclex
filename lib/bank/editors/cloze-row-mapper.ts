// mynclex/lib/bank/editors/cloze-row-mapper.ts
//
// CLOZE DB-row helpers + initial-shape constructor. Lives in a
// non-'use client' module so server pages can import the type and
// helpers without crossing the client boundary.
//
// CLOZE rows live in the same table as MCQ. The schema-level difference
// is the JSONB shape on `content` and `correct`:
//   - content : { blanks: [ { id, choices: [{ id, text }] } ] }
//   - correct : { answers: { [blankId]: choiceId },
//                 feedback: { [blankId]: { [choiceId]: text } } }
//
// Per-blank IDs are 'b1', 'b2', … matching the {N} markers in the stem.
// Per-choice IDs are 'c1', 'c2', … unique within a blank only.

import type { HousekeepingMode } from '@/lib/bank/atoms/housekeeping-fields';
import { CLOZE_MIN_BLANKS, CLOZE_MIN_CHOICES } from '@/lib/bank/classifications';
import { type McqDbRow, MCQ_ROW_COLUMNS } from './mcq-row-mapper';

// ─────────────────────────────────────────────────────────────
// Editor state shapes — what the React component holds in useState.
// `in_stem` flags whether the blank's marker still appears in the
// stem; orphan cards (in_stem=false) are dropped on save but kept
// in editor state so re-typing the marker restores them.
// ─────────────────────────────────────────────────────────────

export interface ClozeEditorChoice {
  id: string;
  text: string;
  feedback: string;
}

export interface ClozeEditorBlank {
  id: string;            // 'b1', 'b2', ...
  choices: ClozeEditorChoice[];
  correct_id: string;
  in_stem: boolean;
}

// ─────────────────────────────────────────────────────────────
// ClozeEditorInitial — initial-value shape the CLOZE editor accepts.
// ─────────────────────────────────────────────────────────────

export interface ClozeEditorInitial {
  itemId: string | null;
  surface: 'admin' | 'tutor';
  mode: HousekeepingMode;
  instruction: string;
  stem: string;
  rationale: string;
  rationale_img: string;
  blanks: ClozeEditorBlank[];
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

// CLOZE rows live in the same table as MCQ. The schema-level difference
// is the JSONB shape on `content` and `correct`.
export interface ClozeDbRow extends Omit<McqDbRow, 'content' | 'correct'> {
  content: {
    blanks?: { id: string; choices?: { id: string; text: string }[] }[];
  } | null;
  correct: {
    answers?: Record<string, string>;
    feedback?: Record<string, Record<string, string>>;
  } | null;
}

export const CLOZE_ROW_COLUMNS = MCQ_ROW_COLUMNS;

// ─────────────────────────────────────────────────────────────
// Empty initial — used by the bank-list "+ New question" flow.
// Pre-seeds CLOZE_MIN_BLANKS markers in the stem AND matching blank
// cards in state, both active. This communicates the "minimum 2
// blanks" rule visibly through the tab strip (two active tabs
// awaiting choices) instead of hiding it until save-time validation.
// The curator edits the stem and replaces the placeholder markers
// in their natural sentence flow.
// ─────────────────────────────────────────────────────────────

export function emptyClozeInitial(surface: 'admin' | 'tutor'): ClozeEditorInitial {
  // Build a starter stem like "{1} {2}" plus matching b1, b2 cards.
  const seedMarkerNumbers = Array.from(
    { length: CLOZE_MIN_BLANKS },
    (_, i) => i + 1,
  );
  const stem = seedMarkerNumbers.map((n) => `{${n}}`).join(' ');
  const blanks: ClozeEditorBlank[] = seedMarkerNumbers.map((n) => ({
    id: `b${n}`,
    choices: Array.from({ length: CLOZE_MIN_CHOICES }, (_, j) => ({
      id: `c${j + 1}`,
      text: '',
      feedback: '',
    })),
    correct_id: 'c1',
    in_stem: true,
  }));

  return {
    itemId: null,
    surface,
    mode: 'standalone',
    instruction: '',
    stem,
    rationale: '',
    rationale_img: '',
    blanks,
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
// Row → initial. Reads the blanks array from row.content, folds in
// the per-blank correct picks from row.correct.answers, and the
// per-choice feedback from row.correct.feedback. Every loaded blank
// is in_stem=true (the row was saved with that marker present).
// ─────────────────────────────────────────────────────────────

export function clozeRowToInitial(
  row: ClozeDbRow,
  surface: 'admin' | 'tutor',
): ClozeEditorInitial {
  const answers = row.correct?.answers ?? {};
  const feedbackMap = row.correct?.feedback ?? {};

  const blanks: ClozeEditorBlank[] = (row.content?.blanks ?? []).map((b) => {
    const fbForBlank = feedbackMap[b.id] ?? {};
    return {
      id: b.id,
      choices: (b.choices ?? []).map((c) => ({
        id: c.id,
        text: c.text,
        feedback: fbForBlank[c.id] ?? '',
      })),
      correct_id: answers[b.id] ?? '',
      in_stem: true,
    };
  });

  return {
    itemId: row.item_id,
    surface,
    mode: 'standalone',
    instruction: row.instruction ?? '',
    stem: row.stem ?? '',
    rationale: row.rationale ?? '',
    rationale_img: row.rationale_img ?? '',
    blanks,
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
