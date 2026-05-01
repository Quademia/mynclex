// mynclex/lib/bank/editors/drag-drop-row-mapper.ts
//
// DRAG_DROP DB-row helpers + initial-shape constructor. Lives in a
// non-'use client' module so server pages can import the type and
// helpers without crossing the client boundary.
//
// DRAG_DROP rows live in the same table as MCQ. The schema-level
// difference is the JSONB shape on `content` and `correct`:
//   - content : { subtype: 'ORDERED'|'SENTENCE',
//                 slots:  [ { id, target_text } ],
//                 tokens: [ { id, text } ] }
//   - correct : { slots: { [slotId]: tokenId },
//                 feedback?: { [slotId]: text } }   // sparse
//
// IDs:
//   - Slot IDs are 's1', 's2', … For SENTENCE, sN ↔ marker [N].
//   - Token IDs are 't1', 't2', … unique within the question.

import type { HousekeepingMode } from '@/lib/bank/atoms/housekeeping-fields';
import {
  MIN_DD_SLOTS,
  DD_TOKEN_POOL_ABSOLUTE_MIN,
  DD_TOKEN_POOL_MIN_EXTRA,
} from '@/lib/bank/classifications';
import { type McqDbRow, MCQ_ROW_COLUMNS } from './mcq-row-mapper';

// ─────────────────────────────────────────────────────────────
// Editor state shapes — what the React component holds in useState.
// Slot rows carry their assigned token id + per-slot feedback locally
// so all of the curator's work survives a subtype/marker edit. The
// parser drops orphan slots on save (SENTENCE only — orphans are
// slot cards whose marker is no longer in the stem).
// ─────────────────────────────────────────────────────────────

export type DragDropSubtype = 'ORDERED' | 'SENTENCE';

export interface DragDropEditorSlot {
  id: string;                 // 's1', 's2', …
  target_text: string;
  assigned_token_id: string;  // '' = unassigned
  feedback: string;
}

export interface DragDropEditorToken {
  id: string;                 // 't1', 't2', …
  text: string;
}

// ─────────────────────────────────────────────────────────────
// DragDropEditorInitial — initial-value shape the editor accepts.
// ─────────────────────────────────────────────────────────────

export interface DragDropEditorInitial {
  itemId: string | null;
  surface: 'admin' | 'tutor';
  mode: HousekeepingMode;
  instruction: string;
  stem: string;
  rationale: string;
  rationale_img: string;
  subtype: DragDropSubtype;
  slots: DragDropEditorSlot[];
  tokens: DragDropEditorToken[];
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

// DRAG_DROP rows live in the same table as MCQ. The schema-level
// difference is the JSONB shape on `content` and `correct`.
export interface DragDropDbRow extends Omit<McqDbRow, 'content' | 'correct'> {
  content: {
    subtype?: DragDropSubtype;
    slots?: { id: string; target_text: string }[];
    tokens?: { id: string; text: string }[];
  } | null;
  correct: {
    slots?: Record<string, string>;
    feedback?: Record<string, string>;
  } | null;
}

export const DRAG_DROP_ROW_COLUMNS = MCQ_ROW_COLUMNS;

// ─────────────────────────────────────────────────────────────
// Empty initial — pre-seeds an ORDERED scaffold with three slots
// (the minimum) and three empty tokens. ORDERED is the friendlier
// default; the curator can flip to SENTENCE via the subtype picker.
// SENTENCE seeding (with a `[1] [2] [3]` stem) happens inside the
// editor when the curator switches subtype, not here, so opening a
// fresh editor doesn't dump square-bracket markers into the stem
// field unless the curator has chosen SENTENCE.
// ─────────────────────────────────────────────────────────────

export function emptyDragDropInitial(
  surface: 'admin' | 'tutor',
): DragDropEditorInitial {
  const seedSlotNumbers = Array.from(
    { length: MIN_DD_SLOTS },
    (_, i) => i + 1,
  );
  const slots: DragDropEditorSlot[] = seedSlotNumbers.map((n) => ({
    id: `s${n}`,
    target_text: ordinalLabel(n),
    assigned_token_id: '',
    feedback: '',
  }));
  // Seed enough tokens to satisfy the NCLEX floor (≥4 in pool + ≥1
  // distractor) for the default scaffold: 3 slots → 4 seeded tokens.
  const seedTokenCount = Math.max(
    MIN_DD_SLOTS + DD_TOKEN_POOL_MIN_EXTRA,
    DD_TOKEN_POOL_ABSOLUTE_MIN,
  );
  const tokens: DragDropEditorToken[] = Array.from(
    { length: seedTokenCount },
    (_, i) => ({ id: `t${i + 1}`, text: '' }),
  );

  return {
    itemId: null,
    surface,
    mode: 'standalone',
    instruction: '',
    stem: '',
    rationale: '',
    rationale_img: '',
    subtype: 'ORDERED',
    slots,
    tokens,
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
// Row → initial. Reads the slot + token arrays from row.content,
// folds each slot's correct token from row.correct.slots and its
// per-slot feedback from row.correct.feedback (sparse). Loaded slots
// are always "active" — the row was saved with all its slots
// reachable (markers present for SENTENCE; ranked positions for
// ORDERED), so no orphan reconstruction is needed at load time.
// ─────────────────────────────────────────────────────────────

export function dragDropRowToInitial(
  row: DragDropDbRow,
  surface: 'admin' | 'tutor',
): DragDropEditorInitial {
  const subtype: DragDropSubtype =
    row.content?.subtype === 'SENTENCE' ? 'SENTENCE' : 'ORDERED';
  const correctSlots = row.correct?.slots ?? {};
  const feedbackMap = row.correct?.feedback ?? {};

  const slots: DragDropEditorSlot[] = (row.content?.slots ?? []).map((s) => ({
    id: s.id,
    target_text: s.target_text ?? '',
    assigned_token_id: correctSlots[s.id] ?? '',
    feedback: feedbackMap[s.id] ?? '',
  }));

  const tokens: DragDropEditorToken[] = (row.content?.tokens ?? []).map((t) => ({
    id: t.id,
    text: t.text ?? '',
  }));

  return {
    itemId: row.item_id,
    surface,
    mode: 'standalone',
    instruction: row.instruction ?? '',
    stem: row.stem ?? '',
    rationale: row.rationale ?? '',
    rationale_img: row.rationale_img ?? '',
    subtype,
    slots,
    tokens,
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
