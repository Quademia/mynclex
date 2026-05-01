// mynclex/lib/authoring/parsers/sata.ts
//
// Select-All-That-Apply parser — at least one correct answer; no upper
// bound on how many. Curators mark any subset as correct.

import { MIN_OPTIONS, MAX_OPTIONS } from '../classifications';
import type { SataContent, SataCorrect, BankOption } from '../types';

export type SataParseResult =
  | { ok: true; content: SataContent; correct: SataCorrect }
  | { ok: false; error: string };

export function parseSata(
  optionIds: string[],
  optionTexts: string[],
  optionFeedbacks: string[],
  correctIds: string[],
): SataParseResult {
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

  if (cleanCorrect.length < 1) {
    return { ok: false, error: 'At least one correct answer is required for SATA.' };
  }

  return {
    ok: true,
    content: { options },
    correct: { answers: cleanCorrect, feedback },
  };
}
