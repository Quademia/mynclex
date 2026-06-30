// mynclex/lib/bank/parsers/drag-cloze.ts
//
// DRAG_CLOZE parser. Takes the curator's slot + token arrays from FormData and
// produces a normalised (stem, content, correct) trio.
//
// DRAG_CLOZE is always sentence mode: the stem carries inline [N] markers. Only
// slots whose id matches an active marker count; orphans (card in state but
// marker removed from stem) are dropped here.
//
// Validation (order matters — later checks assume prior ones passed):
//   1. Extract [N] via /\[(\d+)\]/g; N must be 1..DCZ_MAX_SLOTS and
//      unique; reject otherwise. activeSlotIds = `sN` set.
//   2. Active slot count must be in [DCZ_MIN_SLOTS, DCZ_MAX_SLOTS] (2..8).
//   3. Token count must satisfy
//        tokens.length >= activeSlots.length + DCZ_TOKEN_POOL_MIN_EXTRA
//        tokens.length <= min(activeSlots.length + DCZ_TOKEN_POOL_MAX_OVER_SLOTS,
//                             DCZ_TOKEN_POOL_ABSOLUTE_MAX)
//      i.e. always ≥1 distractor (the structural floor) and not over the
//      NCLEX 10 ceiling. The NCSBN "4+ items" minimum is a curator-facing
//      advisory in the editor, not enforced here. Every token must have
//      non-empty text.
//   4. Every active slot has assigned_token_id pointing at a real token.
//      No token_id may be assigned to more than one active slot.
//
// The stem is NOT rewritten — markers are byte-preserved. There's no silent
// renumber, so `[1] [3]` with slots s1 + s3 saves as-is. That's deliberate:
// renumbering would break URLs / external refs to specific slot IDs, and the
// v1 bounds (2–8 slots, unique markers) keep the shape readable without it.

import {
  DCZ_MIN_SLOTS,
  DCZ_MAX_SLOTS,
  DCZ_TOKEN_POOL_MAX_OVER_SLOTS,
  DCZ_TOKEN_POOL_ABSOLUTE_MAX,
  DCZ_TOKEN_POOL_MIN_EXTRA,
} from '@/lib/bank/classifications';
import type { DragClozeContent, DragClozeCorrect } from '@/lib/bank/types';

export interface DragClozeSlotInput {
  id: string;
  target_text: string;
  assigned_token_id: string;
}

export interface DragClozeTokenInput {
  id: string;
  text: string;
  feedback: string;   // rich-doc JSON (or ''); shown in review, sparse on save
}

export interface DragClozeParseInput {
  stem: string;
  slots: DragClozeSlotInput[];
  tokens: DragClozeTokenInput[];
}

export type DragClozeParseResult =
  | { ok: true; stem: string; content: DragClozeContent; correct: DragClozeCorrect }
  | { ok: false; error: string };

// Matches [1] [12] etc. — a positive integer inside single square
// brackets. Shared with the editor.
const MARKER_RE = /\[(\d+)\]/g;

export function parseDragCloze(input: DragClozeParseInput): DragClozeParseResult {
  const { stem, slots: formSlots, tokens: formTokens } = input;

  // Phase 1 — extract active slot IDs from the stem's [N] markers.
  const seen = new Set<number>();
  for (const m of stem.matchAll(MARKER_RE)) {
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n) || n < 1 || n > DCZ_MAX_SLOTS) {
      return {
        ok: false,
        error: `Sentence marker [${m[1]}] is out of range — use [1]…[${DCZ_MAX_SLOTS}].`,
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
  const activeSlotIds = new Set(Array.from(seen).map((n) => `s${n}`));

  // Phase 2 — slot bounds. We use the active set derived from the stem
  // (not formSlots, since orphan cards don't count).
  const activeSlotCount = activeSlotIds.size;
  if (activeSlotCount < DCZ_MIN_SLOTS) {
    return {
      ok: false,
      error: `Drag-cloze must have at least ${DCZ_MIN_SLOTS} slots. Found ${activeSlotCount}.`,
    };
  }
  if (activeSlotCount > DCZ_MAX_SLOTS) {
    return {
      ok: false,
      error: `Drag-cloze can have at most ${DCZ_MAX_SLOTS} slots. Found ${activeSlotCount}.`,
    };
  }

  // Phase 3 — token bounds + non-empty text.
  if (formTokens.some((t) => t.text.trim() === '')) {
    return { ok: false, error: 'Every token must have non-empty text.' };
  }

  // Structural floor: one token per slot + at least one distractor. The
  // NCSBN 4-item minimum is a norm, surfaced as an editor advisory — not
  // enforced here (a 2-slot item is legitimate with 3 tokens).
  const tokenFloor = activeSlotCount + DCZ_TOKEN_POOL_MIN_EXTRA;
  const tokenCap = Math.min(
    activeSlotCount + DCZ_TOKEN_POOL_MAX_OVER_SLOTS,
    DCZ_TOKEN_POOL_ABSOLUTE_MAX,
  );
  if (formTokens.length < tokenFloor) {
    return {
      ok: false,
      error: `Token pool must have at least ${tokenFloor} tokens (${activeSlotCount} for slots + ${DCZ_TOKEN_POOL_MIN_EXTRA} distractor${DCZ_TOKEN_POOL_MIN_EXTRA === 1 ? '' : 's'}). Found ${formTokens.length}.`,
    };
  }
  if (formTokens.length > tokenCap) {
    return {
      ok: false,
      error: `Token pool can have at most ${tokenCap} tokens (NCLEX caps drag-cloze pools at ${DCZ_TOKEN_POOL_ABSOLUTE_MAX}). Found ${formTokens.length}.`,
    };
  }

  const tokenIdSet = new Set(formTokens.map((t) => t.id));

  // Phase 4 — validate each active slot's assigned token. Track
  // duplicate assignments for a clearer error.
  const assignedTokenToSlot = new Map<string, string>();
  // Walk form slots (which may include orphans) but only inspect active
  // ones. Preserve original form order so the resulting content.slots list
  // is stable.
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

  // Phase 5 — build the persisted shapes.
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

  // correct.feedback: sparse — keyed by TOKEN id, only non-empty. Every
  // token (correct or distractor) may carry feedback; tokens are never
  // dropped (unlike orphan slots), so we keep all non-empty entries.
  const feedback: Record<string, string> = {};
  for (const tok of formTokens) {
    const fb = tok.feedback.trim();
    if (fb !== '') feedback[tok.id] = fb;
  }

  const correct: DragClozeCorrect = {
    slots: correctSlots,
    ...(Object.keys(feedback).length > 0 ? { feedback } : {}),
  };

  return {
    ok: true,
    stem,   // byte-identical — markers preserved, no renumber
    content: { slots: contentSlots, tokens: contentTokens },
    correct,
  };
}
