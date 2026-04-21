// mynclex/lib/bank/parsers/index.ts
//
// Dispatcher that routes a parsed form payload to the right per-type
// parser. Returns a normalized { content, correct } pair (typed as the
// broad BankItem* union) or an error message.
//
// Each parser file handles its own option-building, MIN/MAX bounds,
// correct-id validation, and type-specific rules. This file just
// forwards the raw arrays and narrows the return type.
//
// Server-safe — no 'use client'. Imported by app/(app)/admin/bank/actions.ts.

import type { QuestionType } from '../classifications';
import type { BankItemContent, BankItemCorrect } from '../types';
import { parseMcq } from './mcq';
import { parseTf } from './tf';
import { parseSata } from './sata';
import { parseSelectN } from './select-n';
import { parseMatrix, type MatrixParseInput } from './matrix';

export type ParseResult =
  | { ok: true; content: BankItemContent; correct: BankItemCorrect }
  | { ok: false; error: string };

export function parseByType(
  question_type: QuestionType,
  params: {
    optionIds: string[];
    optionTexts: string[];
    optionFeedbacks: string[];
    correctIds: string[];
    selectCount?: number;
    matrix?: MatrixParseInput;
  },
): ParseResult {
  switch (question_type) {
    case 'MCQ':
      return parseMcq(
        params.optionIds,
        params.optionTexts,
        params.optionFeedbacks,
        params.correctIds,
      );
    case 'TF':
      return parseTf(
        params.optionIds,
        params.optionTexts,
        params.optionFeedbacks,
        params.correctIds,
      );
    case 'SATA':
      return parseSata(
        params.optionIds,
        params.optionTexts,
        params.optionFeedbacks,
        params.correctIds,
      );
    case 'SELECT_N':
      return parseSelectN(
        params.optionIds,
        params.optionTexts,
        params.optionFeedbacks,
        params.correctIds,
        params.selectCount ?? 0,
      );
    case 'MATRIX': {
      if (!params.matrix) {
        return { ok: false, error: 'Missing matrix payload.' };
      }
      return parseMatrix(params.matrix);
    }
  }
}
