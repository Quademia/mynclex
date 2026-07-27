// mynclex/lib/bank/editors/drag-order-row-mapper.ts
//
// DRAG_ORDER DB-row helpers + initial-shape constructor. Lives in a
// non-'use client' module so server pages can import the type and
// helpers without crossing the client boundary.
//
// DRAG_ORDER is the ORDERED half of the old DRAG_DROP type, split into
// its own standalone type: the student drags tokens into ranked positions
// (1st, 2nd, 3rd…). There are NO stem markers — the stem is a plain rich
// prompt — and there is NO subtype discriminator (that was the ORDERED /
// SENTENCE switch; SENTENCE now lives in DRAG_CLOZE).
//
// DRAG_ORDER rows live in the same table as MCQ. The schema-level
// difference is the JSONB shape on `content` and `correct`:
//   - content : { slots:  [ { id, target_text } ],
//                 tokens: [ { id, text } ] }
//   - correct : { slots: { [slotId]: tokenId },
//                 feedback?: { [tokenId]: text } }   // sparse, token-keyed
//
// IDs:
//   - Slot IDs are 's1', 's2', … render order = rank.
//   - Token IDs are 't1', 't2', … unique within the question.

import type { HousekeepingMode } from '@/lib/bank/atoms/housekeeping-fields';
import { DO_DEFAULT_SLOTS } from '@/lib/bank/classifications';
import {
  parseRichDoc,
  EMPTY_RICH_DOC,
  type RichDoc,
} from '@/lib/authoring/rich-doc';
import { type McqDbRow, MCQ_ROW_COLUMNS } from './mcq-row-mapper';

// ─────────────────────────────────────────────────────────────
// Editor state shapes — what the React component holds in useState.
// Slot rows carry their assigned token id locally; tokens carry their
// rich feedback — so all of the curator's work survives an edit.
// There are no orphans (no markers); every slot is always active.
// ─────────────────────────────────────────────────────────────

export interface DragOrderEditorSlot {
  id: string;                 // 's1', 's2', …
  // Slot label/hint stays PLAIN (a short position cue, e.g. "1st action").
  target_text: string;
  assigned_token_id: string;  // '' = unassigned
}

export interface DragOrderEditorToken {
  id: string;                 // 't1', 't2', …
  // Token text stays PLAIN (a short draggable item).
  // Feedback is rich: it shows in the review feedback prose (at the token's
  // slot if correct, or in the distractor strip if it's a trap).
  text: string;
  feedback: RichDoc;
}

// ─────────────────────────────────────────────────────────────
// DragOrderEditorInitial — initial-value shape the editor accepts.
// Same fields as the old DragDropEditorInitial minus `subtype`.
// ─────────────────────────────────────────────────────────────

export interface DragOrderEditorInitial {
  itemId: string | null;
  surface: 'admin' | 'tutor';
  mode: HousekeepingMode;
  instruction: string;
  stem: string;
  rationale: string;
  rationale_img: string;
  slots: DragOrderEditorSlot[];
  tokens: DragOrderEditorToken[];
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

// DRAG_ORDER rows live in the same table as MCQ. The schema-level
// difference is the JSONB shape on `content` and `correct`. No subtype.
export interface DragOrderDbRow extends Omit<McqDbRow, 'content' | 'correct'> {
  content: {
    slots?: { id: string; target_text: string }[];
    tokens?: { id: string; text: string }[];
  } | null;
  correct: {
    slots?: Record<string, string>;
    feedback?: Record<string, string>;
  } | null;
}

export const DRAG_ORDER_ROW_COLUMNS = MCQ_ROW_COLUMNS;

// ─────────────────────────────────────────────────────────────
// Empty initial — pre-seeds an ORDERED scaffold with the recommended
// number of slots (DO_DEFAULT_SLOTS = 3, the advisory count, not the
// structural floor of 2) and enough empty tokens to meet it. The stem
// starts empty — ORDERED has no marker syntax to seed, just a plain
// prompt the curator types (e.g. "Place these steps in order…").
// ─────────────────────────────────────────────────────────────

export function emptyDragOrderInitial(
  surface: 'admin' | 'tutor',
): DragOrderEditorInitial {
  const seedSlotNumbers = Array.from(
    { length: DO_DEFAULT_SLOTS },
    (_, i) => i + 1,
  );
  const slots: DragOrderEditorSlot[] = seedSlotNumbers.map((n) => ({
    id: `s${n}`,
    target_text: ordinalLabel(n),
    assigned_token_id: '',
  }));
  // Seed one token per position — a clean pure-ordering scaffold (distractors
  // are optional, so we don't seed any; the curator adds them if wanted).
  const tokens: DragOrderEditorToken[] = Array.from(
    { length: DO_DEFAULT_SLOTS },
    (_, i) => ({ id: `t${i + 1}`, text: '', feedback: { ...EMPTY_RICH_DOC } }),
  );

  return {
    itemId: null,
    surface,
    mode: 'standalone',
    instruction: '',
    stem: '',
    rationale: '',
    rationale_img: '',
    slots,
    tokens,
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
    shuffle_options: false,
    question_ref: '',
    batch_id: '',
  };
}

// ─────────────────────────────────────────────────────────────
// Row → initial. Reads the slot + token arrays from row.content, folds
// each slot's correct token from row.correct.slots, and folds each token's
// feedback from row.correct.feedback (sparse, token-keyed — with a
// read-coerce for legacy slot-keyed rows). Loaded slots are always
// "active" — ORDERED has no orphan concept.
// ─────────────────────────────────────────────────────────────

export function dragOrderRowToInitial(
  row: DragOrderDbRow,
  surface: 'admin' | 'tutor',
): DragOrderEditorInitial {
  const correctSlots = row.correct?.slots ?? {};
  const feedbackMap = row.correct?.feedback ?? {};

  // Feedback is keyed by TOKEN id. Read-coerce legacy rows whose feedback
  // is keyed by SLOT id: slot keys start with 's', token keys with 't'. A
  // legacy slot's feedback maps onto that slot's correct token
  // (correct.slots[slotId]). No migration — both shapes read cleanly.
  const tokenFeedback: Record<string, string> = {};
  for (const [key, val] of Object.entries(feedbackMap)) {
    if (key.startsWith('t')) {
      tokenFeedback[key] = val;                 // already token-keyed
    } else {
      const tid = correctSlots[key];            // legacy slot-keyed
      if (tid) tokenFeedback[tid] = val;
    }
  }

  const slots: DragOrderEditorSlot[] = (row.content?.slots ?? []).map((s) => ({
    id: s.id,
    target_text: s.target_text ?? '',
    assigned_token_id: correctSlots[s.id] ?? '',
  }));

  const tokens: DragOrderEditorToken[] = (row.content?.tokens ?? []).map((t) => ({
    id: t.id,
    text: t.text ?? '',
    feedback: parseRichDoc(tokenFeedback[t.id] ?? ''),
  }));

  return {
    itemId: row.item_id,
    surface,
    mode: 'standalone',
    instruction: row.instruction ?? '',
    stem: row.stem ?? '',
    rationale: row.rationale ?? '',
    rationale_img: row.rationale_img ?? '',
    slots,
    tokens,
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

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

export function ordinalLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  let suffix = 'th';
  if (mod10 === 1 && mod100 !== 11) suffix = 'st';
  else if (mod10 === 2 && mod100 !== 12) suffix = 'nd';
  else if (mod10 === 3 && mod100 !== 13) suffix = 'rd';
  return `${n}${suffix}`;
}
