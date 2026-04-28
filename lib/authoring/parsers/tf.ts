// mynclex/lib/authoring/parsers/tf.ts
//
// Vendored from lib/bank/parsers/tf.ts in slice 3. See
// lib/authoring/classifications.ts header for the vendoring
// rationale.
//
// True/False parser — same shape as MCQ but with a locked True/False
// option list. The form prevents editing the text, but the server
// re-enforces it independently.

import type { TfContent, TfCorrect, BankOption } from '../types';

export type TfParseResult =
  | { ok: true; content: TfContent; correct: TfCorrect }
  | { ok: false; error: string };

export function parseTf(
  optionIds: string[],
  optionTexts: string[],
  optionFeedbacks: string[],
  correctIds: string[],
): TfParseResult {
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

  if (options.length !== 2 || options[0].text !== 'True' || options[1].text !== 'False') {
    return { ok: false, error: 'True/False questions must have exactly two options: True and False.' };
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
