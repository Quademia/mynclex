// mynclex/lib/bank/parsers/drag-drop.ts
//
// Drag-drop parser. Takes the curator's slot + token arrays from
// FormData and produces a normalised (stem, content, correct) trio.
//
// Two subtypes:
//   ORDERED  : student drags tokens to ranked positions. All form
//              slots are active — there are no orphans.
//   SENTENCE : stem carries inline [N] markers. Only slots whose id
//              matches an active marker count; orphans (card in state
//              but marker removed from stem) are dropped here.
//
// Validation (order matters — later checks assume prior ones passed):
//   1. subtype must be 'ORDERED' or 'SENTENCE'.
//   2. For SENTENCE: extract [N] via /\[(\d+)\]/g; N must be 1..8 and
//      unique; reject otherwise.
//   3. Active slot count must be in [MIN_DD_SLOTS, MAX_DD_SLOTS] (3..8).
//   4. Token count must satisfy
//        tokens.length >= max(activeSlots.length + DD_TOKEN_POOL_MIN_EXTRA,
//                             DD_TOKEN_POOL_ABSOLUTE_MIN)
//        tokens.length <= min(activeSlots.length + DD_TOKEN_POOL_MAX_OVER_SLOTS,
//                             DD_TOKEN_POOL_ABSOLUTE_MAX)
//      i.e. always ≥1 distractor and within the NCLEX 4–10 NGN window.
//      Every token must have non-empty text.
//   5. Every active slot has assigned_token_id pointing at a real token.
//      No token_id may be assigned to more than one active slot.
//
// The stem is NOT rewritten — markers are byte-preserved. Unlike Cloze,
// there's no silent renumber, so `[1] [3]` with slots s1 + s3 saves as-is.
// That's deliberate: renumbering would break URLs / external refs to
// specific slot IDs, and the v1 bounds (3–8 slots, unique markers) keep
// the shape readable without it.

import {
  MIN_DD_SLOTS,
  MAX_DD_SLOTS,
  DD_TOKEN_POOL_MAX_OVER_SLOTS,
  DD_TOKEN_POOL_ABSOLUTE_MIN,
  DD_TOKEN_POOL_ABSOLUTE_MAX,
  DD_TOKEN_POOL_MIN_EXTRA,
} from '../classifications';
import type { DragDropContent, DragDropCorrect } from '../types';

export interface DragDropSlotInput {
  id: string;
  target_text: string;
  assigned_token_id: string;
  feedback: string;
}

export interface DragDropTokenInput {
  id: string;
  text: string;
}

export interface DragDropParseInput {
  stem: string;
  subtype: string;              // validated below
  slots: DragDropSlotInput[];
  tokens: DragDropTokenInput[];
}

export type DragDropParseResult =
  | { ok: true; stem: string; content: DragDropContent; correct: DragDropCorrect }
  | { ok: false; error: string };

// Matches [1] [12] etc. — a positive integer inside single square
// brackets. Shared with the editor.
const MARKER_RE = /\[(\d+)\]/g;

export function parseDragDrop(input: DragDropParseInput): DragDropParseResult {
  const { stem, subtype, slots: formSlots, tokens: formTokens } = input;

  // Phase 1 — subtype
  if (subtype !== 'ORDERED' && subtype !== 'SENTENCE') {
    return { ok: false, error: 'Drag-drop subtype must be ORDERED or SENTENCE.' };
  }

  // Phase 2 — extract active slot IDs
  let activeSlotIds: Set<string>;
  if (subtype === 'SENTENCE') {
    const seen = new Set<number>();
    for (const m of stem.matchAll(MARKER_RE)) {
      const n = parseInt(m[1], 10);
      if (!Number.isFinite(n) || n < 1 || n > MAX_DD_SLOTS) {
        return {
          ok: false,
          error: `Sentence marker [${m[1]}] is out of range — use [1]…[${MAX_DD_SLOTS}].`,
        };
      }
      if (seen.has(n)) {
        return {
          ok: false,
          error: `Sentence marker [${n}] appears more than once — each marker must be unique.`,
        };
      }
      seen.add(n);
    }
    activeSlotIds = new Set(Array.from(seen).map((n) => `s${n}`));
  } else {
    // ORDERED — every form slot is active.
    activeSlotIds = new Set(formSlots.map((s) => s.id));
  }

  // Phase 3 — slot bounds. For SENTENCE we use the active set derived
  // from the stem (not formSlots, since orphan cards don't count).
  // For ORDERED they're the same.
  const activeSlotCount = activeSlotIds.size;
  if (activeSlotCount < MIN_DD_SLOTS) {
    return {
      ok: false,
      error: `Drag-drop must have at least ${MIN_DD_SLOTS} slots. Found ${activeSlotCount}.`,
    };
  }
  if (activeSlotCount > MAX_DD_SLOTS) {
    return {
      ok: false,
      error: `Drag-drop can have at most ${MAX_DD_SLOTS} slots. Found ${activeSlotCount}.`,
    };
  }

  // Phase 4 — token bounds + non-empty text.
  if (formTokens.some((t) => t.text.trim() === '')) {
    return { ok: false, error: 'Every token must have non-empty text.' };
  }

  const tokenFloor = Math.max(
    activeSlotCount + DD_TOKEN_POOL_MIN_EXTRA,
    DD_TOKEN_POOL_ABSOLUTE_MIN,
  );
  const tokenCap = Math.min(
    activeSlotCount + DD_TOKEN_POOL_MAX_OVER_SLOTS,
    DD_TOKEN_POOL_ABSOLUTE_MAX,
  );
  if (formTokens.length < tokenFloor) {
    const distractorsNeeded = Math.max(
      DD_TOKEN_POOL_MIN_EXTRA,
      DD_TOKEN_POOL_ABSOLUTE_MIN - activeSlotCount,
    );
    return {
      ok: false,
      error: `Token pool must have at least ${tokenFloor} tokens (${activeSlotCount} for slots + ${distractorsNeeded} distractor${distractorsNeeded === 1 ? '' : 's'}). Found ${formTokens.length}.`,
    };
  }
  if (formTokens.length > tokenCap) {
    return {
      ok: false,
      error: `Token pool can have at most ${tokenCap} tokens (NCLEX caps drag-drop pools at ${DD_TOKEN_POOL_ABSOLUTE_MAX}). Found ${formTokens.length}.`,
    };
  }

  const tokenIdSet = new Set(formTokens.map((t) => t.id));

  // Phase 5 — validate each active slot's assigned token. Track
  // duplicate assignments for a clearer error.
  const assignedTokenToSlot = new Map<string, string>();
  // Walk form slots (which may include orphans in SENTENCE mode) but
  // only inspect active ones. Preserve original form order so the
  // resulting content.slots list is stable.
  for (const slot of formSlots) {
    if (!activeSlotIds.has(slot.id)) continue;
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

  // Safety: the Set loop above counts by id. If a form slot id is
  // duplicated somehow (shouldn't be, but), we catch it here by
  // comparing the number of visits.
  let visitedActive = 0;
  for (const slot of formSlots) {
    if (activeSlotIds.has(slot.id)) visitedActive++;
  }
  if (visitedActive < activeSlotCount) {
    return {
      ok: false,
      error: 'One or more active slots are missing from the form payload.',
    };
  }

  // Phase 6 — build the persisted shapes.
  // content.slots: only active slots, in form order, with target_text
  // carried through (trimmed).
  const contentSlots = formSlots
    .filter((s) => activeSlotIds.has(s.id))
    .map((s) => ({ id: s.id, target_text: s.target_text.trim() }));

  const contentTokens = formTokens.map((t) => ({ id: t.id, text: t.text.trim() }));

  // correct.slots: slotId → tokenId, only active slots.
  const correctSlots: Record<string, string> = {};
  for (const slot of formSlots) {
    if (!activeSlotIds.has(slot.id)) continue;
    correctSlots[slot.id] = slot.assigned_token_id.trim();
  }

  // correct.feedback: sparse — only non-empty, only active slots.
  const feedback: Record<string, string> = {};
  for (const slot of formSlots) {
    if (!activeSlotIds.has(slot.id)) continue;
    const fb = slot.feedback.trim();
    if (fb !== '') feedback[slot.id] = fb;
  }

  const correct: DragDropCorrect = {
    slots: correctSlots,
    ...(Object.keys(feedback).length > 0 ? { feedback } : {}),
  };

  return {
    ok: true,
    stem,   // byte-identical — markers preserved, no renumber
    content: { subtype, slots: contentSlots, tokens: contentTokens },
    correct,
  };
}
