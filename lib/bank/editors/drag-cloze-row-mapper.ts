// mynclex/lib/bank/editors/drag-cloze-row-mapper.ts
//
// DRAG_CLOZE DB-row helpers + initial-shape constructor. Lives in a
// non-'use client' module so server pages can import the type and
// helpers without crossing the client boundary.
//
// DRAG_CLOZE rows live in the same table as MCQ. The schema-level
// difference is the JSONB shape on `content` and `correct`:
//   - content : { slots:  [ { id, target_text } ],
//                 tokens: [ { id, text } ] }
//   - correct : { slots: { [slotId]: tokenId },
//                 feedback?: { [tokenId]: text } }   // sparse, token-keyed
//
// DRAG_CLOZE is always sentence mode — there is no subtype field. The stem
// carries inline [N] markers; slot sN ↔ marker [N].
//
// IDs:
//   - Slot IDs are 's1', 's2', … sN ↔ marker [N].
//   - Token IDs are 't1', 't2', … unique within the question.

import type { HousekeepingMode } from '@/lib/bank/atoms/housekeeping-fields';
import {
  DCZ_RECOMMENDED_MIN_SLOTS,
  DCZ_TOKEN_POOL_RECOMMENDED_MIN,
  DCZ_TOKEN_POOL_MIN_EXTRA,
} from '@/lib/bank/classifications';
import {
  parseRichDoc,
  EMPTY_RICH_DOC,
  type RichDoc,
} from '@/lib/authoring/rich-doc';
import { type McqDbRow, MCQ_ROW_COLUMNS } from './mcq-row-mapper';

// ─────────────────────────────────────────────────────────────
// Editor state shapes — what the React component holds in useState.
// Slot rows carry their assigned token id locally; tokens carry their
// rich feedback — so all of the curator's work survives a marker edit.
// The parser drops orphan slots on save (orphans are slot cards whose
// marker is no longer in the stem).
// ─────────────────────────────────────────────────────────────

export interface DragClozeEditorSlot {
  id: string;                 // 's1', 's2', …
  // Slot label/hint stays PLAIN (a short cue).
  target_text: string;
  assigned_token_id: string;  // '' = unassigned
}

export interface DragClozeEditorToken {
  id: string;                 // 't1', 't2', …
  // Token text stays PLAIN (a short draggable item).
  // Feedback is rich: it shows in the review feedback prose (at the token's
  // slot if correct, or in the distractor strip if it's a trap).
  text: string;
  feedback: RichDoc;
}

// ─────────────────────────────────────────────────────────────
// DragClozeEditorInitial — initial-value shape the editor accepts.
// No subtype field — DRAG_CLOZE is always sentence mode.
// ─────────────────────────────────────────────────────────────

export interface DragClozeEditorInitial {
  itemId: string | null;
  surface: 'admin' | 'tutor';
  mode: HousekeepingMode;
  instruction: string;
  stem: string;
  rationale: string;
  rationale_img: string;
  slots: DragClozeEditorSlot[];
  tokens: DragClozeEditorToken[];
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

// DRAG_CLOZE rows live in the same table as MCQ. The schema-level
// difference is the JSONB shape on `content` and `correct`. No subtype.
export interface DragClozeDbRow extends Omit<McqDbRow, 'content' | 'correct'> {
  content: {
    slots?: { id: string; target_text: string }[];
    tokens?: { id: string; text: string }[];
  } | null;
  correct: {
    slots?: Record<string, string>;
    feedback?: Record<string, string>;
  } | null;
}

export const DRAG_CLOZE_ROW_COLUMNS = MCQ_ROW_COLUMNS;

// ─────────────────────────────────────────────────────────────
// Empty initial — pre-seeds a starter sentence with three [N] markers
// (the recommended count, not the structural floor of 2) and enough
// empty tokens to meet it. The editor read-coerces the plain `stem`
// string into a rich doc, then derives slots from its markers.
// ─────────────────────────────────────────────────────────────

export function emptyDragClozeInitial(
  surface: 'admin' | 'tutor',
): DragClozeEditorInitial {
  const seedSlotNumbers = Array.from(
    { length: DCZ_RECOMMENDED_MIN_SLOTS },
    (_, i) => i + 1,
  );
  const slots: DragClozeEditorSlot[] = seedSlotNumbers.map((n) => ({
    id: `s${n}`,
    target_text: '',
    assigned_token_id: '',
  }));
  // Seed enough tokens to meet the recommended NCLEX floor (≥4 in pool +
  // ≥1 distractor) for the default 3-slot scaffold: 3 slots → 4 seeded tokens.
  const seedTokenCount = Math.max(
    DCZ_RECOMMENDED_MIN_SLOTS + DCZ_TOKEN_POOL_MIN_EXTRA,
    DCZ_TOKEN_POOL_RECOMMENDED_MIN,
  );
  const tokens: DragClozeEditorToken[] = Array.from(
    { length: seedTokenCount },
    (_, i) => ({ id: `t${i + 1}`, text: '', feedback: { ...EMPTY_RICH_DOC } }),
  );

  return {
    itemId: null,
    surface,
    mode: 'standalone',
    instruction: '',
    stem: 'Step one: [1]. Step two: [2]. Step three: [3].',
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
// "active" — the row was saved with all its slots reachable (markers
// present in the stem), so no orphan reconstruction is needed at load time.
// ─────────────────────────────────────────────────────────────

export function dragClozeRowToInitial(
  row: DragClozeDbRow,
  surface: 'admin' | 'tutor',
): DragClozeEditorInitial {
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

  const slots: DragClozeEditorSlot[] = (row.content?.slots ?? []).map((s) => ({
    id: s.id,
    target_text: s.target_text ?? '',
    assigned_token_id: correctSlots[s.id] ?? '',
  }));

  const tokens: DragClozeEditorToken[] = (row.content?.tokens ?? []).map((t) => ({
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
