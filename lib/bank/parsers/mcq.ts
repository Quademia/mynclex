// mynclex/lib/bank/parsers/mcq.ts
//
// MCQ parser — builds a validated { content, correct } pair from the
// raw option/correct arrays posted by the authoring form. Runs on the
// server (no 'use client'); invoked by the parseByType() dispatcher.

import { MIN_OPTIONS, MAX_OPTIONS } from '../classifications';
import type { McqContent, McqCorrect, BankOption } from '../types';

export type McqParseResult =
  | { ok: true; content: McqContent; correct: McqCorrect }
  | { ok: false; error: string };

export function parseMcq(
  optionIds: string[],
  optionTexts: string[],
  optionFeedbacks: string[],
  correctIds: string[],
): McqParseResult {
  if (optionIds.length !== optionTexts.length || optionIds.length !== optionFeedbacks.length) {
    return { ok: false, error: 'Option arrays out of sync.' };
  }

  const options: BankOption[] = [];
  const feedback: Record<string, string> = {};
  for (let i = 0; i < optionIds.length; i++) {
    const id = optionIds[i].trim();
    const text = optionTexts[i].trim();
    if (!id || !text) continue;
    options.push({ id, text });
    const fb = optionFeedbacks[i].trim();
    if (fb) feedback[id] = fb;
  }

  if (options.length < MIN_OPTIONS) {
    return { ok: false, error: `At least ${MIN_OPTIONS} non-empty options are required.` };
  }
  if (options.length > MAX_OPTIONS) {
    return { ok: false, error: `At most ${MAX_OPTIONS} options are allowed.` };
  }

  const validIds = new Set(options.map((o) => o.id));
  const cleanCorrect = correctIds.map((c) => c.trim()).filter(Boolean);
  for (const cid of cleanCorrect) {
    if (!validIds.has(cid)) {
      return { ok: false, error: `Correct answer "${cid}" does not match any option.` };
    }
  }

  if (cleanCorrect.length !== 1) {
    return { ok: false, error: 'Exactly one correct answer is required.' };
  }

  return {
    ok: true,
    content: { options },
    correct: { answer: cleanCorrect[0], feedback },
  };
}
