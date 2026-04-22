// mynclex/lib/bank/parsers/cloze.ts
//
// Cloze parser — takes the curator's stem (with {N} markers) and a
// flat list of blank cards from the form, and produces a normalised
// (stem, content, correct) trio.
//
// Four jobs:
//   1. Extract {N} markers from the stem in first-appearance order.
//      Reject duplicates — each marker must appear exactly once.
//   2. Drop orphan blank cards (present in form state but not in stem).
//   3. Silently renumber gaps: {1} {3} → {1} {2}. Blank IDs remap in
//      lockstep (b3 → b2) so content.blanks / correct.answers /
//      correct.feedback stay consistent.
//   4. Validate each surviving blank: 2–5 choices, exactly one correct,
//      no empty or duplicate choice text.
//
// The renumber uses a two-phase placeholder substitution so that a new
// number never collides with an original number. Phase 1 replaces every
// {N} with a NUL-wrapped sentinel containing the blank's first-appearance
// index; phase 2 rewrites each sentinel to its final {i+1}.

import {
  CLOZE_MIN_BLANKS,
  CLOZE_MAX_BLANKS,
  CLOZE_MIN_CHOICES,
  CLOZE_MAX_CHOICES,
} from '../classifications';
import type { ClozeContent, ClozeCorrect } from '../types';

// Input a single blank card contributes to the parser. The editor and
// actions.ts assemble this from the FormData hidden inputs.
export interface ClozeBlankInput {
  id: string;                                                          // 'b1', 'b2', ...
  choices: { id: string; text: string; feedback: string }[];
  correct_id: string;
}

export interface ClozeParseInput {
  stem: string;                                                        // raw curator stem with {N} markers
  blanks: ClozeBlankInput[];                                           // every card the editor holds (including orphans)
}

export type ClozeParseResult =
  | { ok: true; stem: string; content: ClozeContent; correct: ClozeCorrect }
  | { ok: false; error: string };

const MARKER_RE = /\{(\d+)\}/g;

export function parseCloze(input: ClozeParseInput): ClozeParseResult {
  const rawStem = input.stem;

  // Phase 1 — extract marker order + reject duplicates.
  const markerOrder: number[] = [];
  const seen = new Set<number>();
  let m: RegExpExecArray | null;
  MARKER_RE.lastIndex = 0;
  while ((m = MARKER_RE.exec(rawStem)) !== null) {
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n) || n < 1) {
      return { ok: false, error: `Invalid marker "{${m[1]}}" in stem — markers must be {1}..{${CLOZE_MAX_BLANKS}}.` };
    }
    if (seen.has(n)) {
      return { ok: false, error: `Marker {${n}} appears more than once in the stem. Each marker must be unique.` };
    }
    seen.add(n);
    markerOrder.push(n);
  }

  if (markerOrder.length < CLOZE_MIN_BLANKS) {
    return { ok: false, error: `Stem must contain at least ${CLOZE_MIN_BLANKS} blanks. Found ${markerOrder.length}.` };
  }
  if (markerOrder.length > CLOZE_MAX_BLANKS) {
    return { ok: false, error: `Stem can contain at most ${CLOZE_MAX_BLANKS} blanks. Found ${markerOrder.length}.` };
  }

  // Phase 2 — match each marker to its form card (by id 'bN').
  const cardById = new Map<string, ClozeBlankInput>();
  for (const b of input.blanks) cardById.set(b.id, b);

  const active: ClozeBlankInput[] = [];
  for (const n of markerOrder) {
    const card = cardById.get(`b${n}`);
    if (!card) {
      return { ok: false, error: `Stem references {${n}} but no matching blank card exists.` };
    }
    active.push(card);
  }

  // Phase 3 — build the old-to-new blank ID remap.
  // (active is in marker first-appearance order, so index i → new id 'b{i+1}'.)
  const idRemap = new Map<string, string>();
  active.forEach((b, i) => { idRemap.set(b.id, `b${i + 1}`); });

  // Phase 4 — renumber the stem using two-phase placeholder substitution.
  // Replace each {N} with \u0000<idx>\u0000, then each sentinel with {idx+1}.
  // Two-phase prevents collisions like {1} {3} → first pass would rewrite
  // {3} as {2}, which would then match and overwrite the already-rewritten
  // {1} on a naive one-pass approach.
  let renumbered = rawStem;
  markerOrder.forEach((n, i) => {
    renumbered = renumbered.replace(`{${n}}`, `\u0000${i}\u0000`);
  });
  markerOrder.forEach((_, i) => {
    renumbered = renumbered.replace(`\u0000${i}\u0000`, `{${i + 1}}`);
  });

  // Phase 5 — validate each active blank and build final shapes.
  const contentBlanks: { id: string; choices: { id: string; text: string }[] }[] = [];
  const answers: Record<string, string> = {};
  const feedback: Record<string, Record<string, string>> = {};

  for (const card of active) {
    const newBlankId = idRemap.get(card.id)!;
    const humanBlank = newBlankId.toUpperCase();

    const choices = card.choices
      .map((c) => ({ id: c.id.trim(), text: c.text.trim(), feedback: c.feedback.trim() }))
      .filter((c) => c.id !== '' && c.text !== '');

    if (choices.length < CLOZE_MIN_CHOICES) {
      return { ok: false, error: `Blank ${humanBlank} needs at least ${CLOZE_MIN_CHOICES} choices with text.` };
    }
    if (choices.length > CLOZE_MAX_CHOICES) {
      return { ok: false, error: `Blank ${humanBlank} can have at most ${CLOZE_MAX_CHOICES} choices.` };
    }

    // Duplicate-id check within a blank.
    const idSet = new Set(choices.map((c) => c.id));
    if (idSet.size !== choices.length) {
      return { ok: false, error: `Blank ${humanBlank} has duplicate choice IDs.` };
    }

    // Duplicate-text check (case-insensitive after trim).
    const normalised = choices.map((c) => c.text.toLowerCase());
    if (new Set(normalised).size !== normalised.length) {
      return { ok: false, error: `Blank ${humanBlank} has two choices with the same text.` };
    }

    // Exactly one correct — must reference a surviving choice.
    const correctId = card.correct_id.trim();
    if (!correctId) {
      return { ok: false, error: `Blank ${humanBlank} has no correct choice selected.` };
    }
    if (!idSet.has(correctId)) {
      return { ok: false, error: `Blank ${humanBlank} — the selected correct choice no longer exists. Re-select a correct choice.` };
    }

    contentBlanks.push({
      id: newBlankId,
      choices: choices.map((c) => ({ id: c.id, text: c.text })),
    });
    answers[newBlankId] = correctId;

    const fbForBlank: Record<string, string> = {};
    for (const c of choices) {
      if (c.feedback !== '') fbForBlank[c.id] = c.feedback;
    }
    if (Object.keys(fbForBlank).length > 0) {
      feedback[newBlankId] = fbForBlank;
    }
  }

  return {
    ok: true,
    stem: renumbered,
    content: { blanks: contentBlanks },
    correct: { answers, feedback },
  };
}
