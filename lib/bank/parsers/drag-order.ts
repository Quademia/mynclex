// mynclex/lib/bank/parsers/drag-order.ts
//
// DRAG_ORDER parser. Takes the curator's slot + token arrays from FormData and
// produces a normalised (content, correct) pair.
//
// DRAG_ORDER is the ORDERED half of the old DRAG_DROP type: the student drags
// tokens to ranked positions (1st, 2nd, …). There are NO stem markers — the
// stem is a plain rich prompt handled by the save action — so this parser takes
// no `stem` and emits no `stem`. Every form slot is active; there are no
// orphans and no subtype.
//
// Validation (order matters — later checks assume prior ones passed):
//   1. Active slot count must be in [DO_MIN_SLOTS, DO_MAX_SLOTS] (2..8).
//   2. Token count must satisfy
//        tokens.length >= activeSlots.length + DO_TOKEN_POOL_MIN_EXTRA
//        tokens.length <= min(activeSlots.length + DO_TOKEN_POOL_MAX_OVER_SLOTS,
//                             DO_TOKEN_POOL_ABSOLUTE_MAX)
//      i.e. always ≥1 distractor (the structural floor) and not over the
//      NCLEX 10 ceiling. The NCSBN "4+ items" minimum is a curator-facing
//      advisory in the editor, not enforced here. Every token must have
//      non-empty text.
//   3. Every slot has assigned_token_id pointing at a real token.
//      No token_id may be assigned to more than one slot.

import {
  DO_MIN_SLOTS,
  DO_MAX_SLOTS,
  DO_TOKEN_POOL_MAX_OVER_SLOTS,
  DO_TOKEN_POOL_ABSOLUTE_MAX,
  DO_TOKEN_POOL_MIN_EXTRA,
} from '@/lib/bank/classifications';
import type { DragOrderContent, DragOrderCorrect } from '@/lib/bank/types';

export interface DragOrderSlotInput {
  id: string;
  target_text: string;
  assigned_token_id: string;
}

export interface DragOrderTokenInput {
  id: string;
  text: string;
  feedback: string;   // rich-doc JSON (or ''); shown in review, sparse on save
}

export interface DragOrderParseInput {
  slots: DragOrderSlotInput[];
  tokens: DragOrderTokenInput[];
}

export type DragOrderParseResult =
  | { ok: true; content: DragOrderContent; correct: DragOrderCorrect }
  | { ok: false; error: string };

export function parseDragOrder(input: DragOrderParseInput): DragOrderParseResult {
  const { slots: formSlots, tokens: formTokens } = input;

  // Phase 1 — slot bounds. Every form slot is active (no markers, no orphans).
  const activeSlotCount = formSlots.length;
  if (activeSlotCount < DO_MIN_SLOTS) {
    return {
      ok: false,
      error: `Drag-to-order must have at least ${DO_MIN_SLOTS} slots. Found ${activeSlotCount}.`,
    };
  }
  if (activeSlotCount > DO_MAX_SLOTS) {
    return {
      ok: false,
      error: `Drag-to-order can have at most ${DO_MAX_SLOTS} slots. Found ${activeSlotCount}.`,
    };
  }

  // Phase 2 — token bounds + non-empty text.
  if (formTokens.some((t) => t.text.trim() === '')) {
    return { ok: false, error: 'Every token must have non-empty text.' };
  }

  // Structural floor: one token per position. Distractors are OPTIONAL for an
  // ordered-response item (DO_TOKEN_POOL_MIN_EXTRA = 0), so the floor is just
  // the slot count; extra distractor tokens are allowed up to the cap.
  const tokenFloor = activeSlotCount + DO_TOKEN_POOL_MIN_EXTRA;
  const tokenCap = Math.min(
    activeSlotCount + DO_TOKEN_POOL_MAX_OVER_SLOTS,
    DO_TOKEN_POOL_ABSOLUTE_MAX,
  );
  if (formTokens.length < tokenFloor) {
    return {
      ok: false,
      error: `Token pool must have at least one token per position (${tokenFloor} for ${activeSlotCount} slot${activeSlotCount === 1 ? '' : 's'}). Found ${formTokens.length}.`,
    };
  }
  if (formTokens.length > tokenCap) {
    return {
      ok: false,
      error: `Token pool can have at most ${tokenCap} tokens (NCLEX caps drag-to-order pools at ${DO_TOKEN_POOL_ABSOLUTE_MAX}). Found ${formTokens.length}.`,
    };
  }

  const tokenIdSet = new Set(formTokens.map((t) => t.id));

  // Phase 3 — validate each slot's assigned token. Track duplicate
  // assignments for a clearer error. Preserve form order so the resulting
  // content.slots list (= rank order) is stable.
  const assignedTokenToSlot = new Map<string, string>();
  for (const slot of formSlots) {
    const tid = slot.assigned_token_id.trim();
    if (tid === '') {
      return {
        ok: false,
        error: `Slot ${slot.id} is missing its correct token — assign one from the pool.`,
      };
    }
    if (!tokenIdSet.has(tid)) {
      return {
        ok: false,
        error: `Slot ${slot.id} is assigned an unknown token (${tid}).`,
      };
    }
    const prior = assignedTokenToSlot.get(tid);
    if (prior) {
      return {
        ok: false,
        error: `Token ${tid} is assigned to both ${prior} and ${slot.id} — each token can fill only one slot.`,
      };
    }
    assignedTokenToSlot.set(tid, slot.id);
  }

  // Phase 4 — build the persisted shapes.
  // content.slots: all slots, in form order (= rank), with target_text
  // carried through (trimmed).
  const contentSlots = formSlots.map((s) => ({
    id: s.id,
    target_text: s.target_text.trim(),
  }));

  const contentTokens = formTokens.map((t) => ({ id: t.id, text: t.text.trim() }));

  // correct.slots: slotId → tokenId.
  const correctSlots: Record<string, string> = {};
  for (const slot of formSlots) {
    correctSlots[slot.id] = slot.assigned_token_id.trim();
  }

  // correct.feedback: sparse — keyed by TOKEN id, only non-empty. Every
  // token (correct or distractor) may carry feedback; tokens are never
  // dropped, so we keep all non-empty entries.
  const feedback: Record<string, string> = {};
  for (const tok of formTokens) {
    const fb = tok.feedback.trim();
    if (fb !== '') feedback[tok.id] = fb;
  }

  const correct: DragOrderCorrect = {
    slots: correctSlots,
    ...(Object.keys(feedback).length > 0 ? { feedback } : {}),
  };

  return {
    ok: true,
    content: { slots: contentSlots, tokens: contentTokens },
    correct,
  };
}
