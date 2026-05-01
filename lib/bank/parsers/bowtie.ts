// mynclex/lib/bank/parsers/bowtie.ts
//
// Bow-tie parser — builds a validated { content, correct } pair from the
// three wings posted by the authoring form. Runs on the server.
//
// Validation rules (strict NCLEX):
//   - All three wings present with non-empty labels
//   - Left:   2–8 tokens, exactly 2 marked correct
//   - Centre: 1–8 tokens, exactly 1 marked correct
//   - Right:  2–8 tokens, exactly 2 marked correct
//   - All tokens have non-empty text
//   - Token IDs unique within each wing (we don't require global
//     uniqueness at parse time because the prefix convention lt/ct/rt
//     makes collisions impossible if the editor behaves)

import {
  BT_LEFT_CORRECT,
  BT_CENTRE_CORRECT,
  BT_RIGHT_CORRECT,
  BT_WING_MAX_TOKENS,
} from '../classifications';
import type {
  BowtieContent,
  BowtieCorrect,
  BowtieToken,
} from '../types';

// Payload the parser receives per wing — assembled by save-question.ts
export interface BowtieWingInput {
  label: string;
  tokenIds:       string[];
  tokenTexts:     string[];
  tokenFeedbacks: string[];
  correctIds:     string[];   // which IDs were ticked/selected
}

export interface BowtieParseInput {
  left:   BowtieWingInput;
  centre: BowtieWingInput;
  right:  BowtieWingInput;
}

export type BowtieParseResult =
  | { ok: true; content: BowtieContent; correct: BowtieCorrect }
  | { ok: false; error: string };

function buildWing(
  wingName: 'left' | 'centre' | 'right',
  input: BowtieWingInput,
  requiredCorrect: number,
  feedbackSink: Record<string, string>,
):
  | { ok: true; label: string; tokens: BowtieToken[]; correctIds: string[] }
  | { ok: false; error: string }
{
  const label = input.label.trim();
  if (!label) {
    return { ok: false, error: `${capitalise(wingName)} wing label is required.` };
  }

  if (
    input.tokenIds.length !== input.tokenTexts.length ||
    input.tokenIds.length !== input.tokenFeedbacks.length
  ) {
    return { ok: false, error: `${capitalise(wingName)} wing token arrays out of sync.` };
  }

  const tokens: BowtieToken[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < input.tokenIds.length; i++) {
    const id = input.tokenIds[i].trim();
    const text = input.tokenTexts[i].trim();
    if (!id || !text) continue;
    if (seen.has(id)) {
      return { ok: false, error: `Duplicate token ID "${id}" in ${wingName} wing.` };
    }
    seen.add(id);
    tokens.push({ id, text });
    const fb = input.tokenFeedbacks[i].trim();
    if (fb) feedbackSink[id] = fb;
  }

  if (tokens.length < requiredCorrect) {
    return {
      ok: false,
      error: `${capitalise(wingName)} wing needs at least ${requiredCorrect} token${requiredCorrect === 1 ? '' : 's'} with text.`,
    };
  }
  if (tokens.length > BT_WING_MAX_TOKENS) {
    return {
      ok: false,
      error: `${capitalise(wingName)} wing has too many tokens (max ${BT_WING_MAX_TOKENS}).`,
    };
  }

  // Validate correctIds — each must resolve to a real token in this wing
  const validIds = new Set(tokens.map((t) => t.id));
  const correctIds = input.correctIds.map((c) => c.trim()).filter(Boolean);
  const dedupedCorrect = Array.from(new Set(correctIds));

  for (const cid of dedupedCorrect) {
    if (!validIds.has(cid)) {
      return {
        ok: false,
        error: `${capitalise(wingName)} wing correct ID "${cid}" does not match any token.`,
      };
    }
  }

  if (dedupedCorrect.length !== requiredCorrect) {
    return {
      ok: false,
      error: `${capitalise(wingName)} wing requires exactly ${requiredCorrect} correct token${requiredCorrect === 1 ? '' : 's'} (got ${dedupedCorrect.length}).`,
    };
  }

  return { ok: true, label, tokens, correctIds: dedupedCorrect };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function parseBowtie(input: BowtieParseInput): BowtieParseResult {
  const feedback: Record<string, string> = {};

  const left = buildWing('left', input.left, BT_LEFT_CORRECT, feedback);
  if (!left.ok) return left;

  const centre = buildWing('centre', input.centre, BT_CENTRE_CORRECT, feedback);
  if (!centre.ok) return centre;

  const right = buildWing('right', input.right, BT_RIGHT_CORRECT, feedback);
  if (!right.ok) return right;

  // Clean feedback: only keep entries that correspond to surviving tokens.
  const survivingIds = new Set([
    ...left.tokens.map((t) => t.id),
    ...centre.tokens.map((t) => t.id),
    ...right.tokens.map((t) => t.id),
  ]);
  const cleanFeedback: Record<string, string> = {};
  for (const [id, fb] of Object.entries(feedback)) {
    if (survivingIds.has(id)) cleanFeedback[id] = fb;
  }

  return {
    ok: true,
    content: {
      left:   { label: left.label,   tokens: left.tokens },
      centre: { label: centre.label, tokens: centre.tokens },
      right:  { label: right.label,  tokens: right.tokens },
    },
    correct: {
      left:     left.correctIds,
      centre:   centre.correctIds[0],  // safe: we enforced length === 1
      right:    right.correctIds,
      feedback: cleanFeedback,
    },
  };
}
