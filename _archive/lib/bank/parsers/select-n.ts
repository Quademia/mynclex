// mynclex/lib/bank/parsers/select-n.ts
//
// Select-N parser — students must pick exactly N correct options, where
// N is chosen by the curator (1..options.length). The form UI renders
// checkboxes + a numeric "Select exactly" field.

import { MIN_OPTIONS, MAX_OPTIONS } from '../classifications';
import type { SelectNContent, SelectNCorrect, BankOption } from '../types';

export type SelectNParseResult =
  | { ok: true; content: SelectNContent; correct: SelectNCorrect }
  | { ok: false; error: string };

export function parseSelectN(
  optionIds: string[],
  optionTexts: string[],
  optionFeedbacks: string[],
  correctIds: string[],
  selectCount: number,
): SelectNParseResult {
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

  if (!Number.isFinite(selectCount) || selectCount < 1 || selectCount > options.length) {
    return { ok: false, error: 'Select N: choose a valid count (1 to number of options).' };
  }
  if (cleanCorrect.length !== selectCount) {
    return { ok: false, error: `Select N: exactly ${selectCount} correct answer(s) must be marked.` };
  }

  return {
    ok: true,
    content: { options, select_count: selectCount },
    correct: { answers: cleanCorrect, feedback },
  };
}
