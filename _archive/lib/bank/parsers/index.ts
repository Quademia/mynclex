// mynclex/lib/bank/parsers/index.ts
//
// Dispatcher that routes a parsed form payload to the right per-type
// parser. Returns a normalized { content, correct } pair (typed as the
// broad BankItem* union) or an error message.
//
// CLOZE additionally returns a normalised `stem` — the parser rewrites
// {N} markers to close gaps (e.g. "{1} {3}" → "{1} {2}"). Callers use
// `parsed.stem ?? originalStem` so Matrix / Bow-tie / Family A code is
// unaffected.
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
import { parseBowtie, type BowtieParseInput } from './bowtie';
import { parseCloze, type ClozeBlankInput } from './cloze';
import { parseHighlight, type HighlightChunkInput } from './highlight';
import {
  parseDragDrop,
  type DragDropSlotInput,
  type DragDropTokenInput,
} from './drag-drop';

export type ParseResult =
  | { ok: true; content: BankItemContent; correct: BankItemCorrect; stem?: string }
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
    bowtie?: BowtieParseInput;
    cloze?: { stem: string; blanks: ClozeBlankInput[] };
    highlight?: { stem: string; chunks: HighlightChunkInput[] };
    dragDrop?: {
      stem: string;
      subtype: string;
      slots: DragDropSlotInput[];
      tokens: DragDropTokenInput[];
    };
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
    case 'BOWTIE': {
      if (!params.bowtie) {
        return { ok: false, error: 'Missing bow-tie payload.' };
      }
      return parseBowtie(params.bowtie);
    }
    case 'CLOZE': {
      if (!params.cloze) {
        return { ok: false, error: 'Missing cloze payload.' };
      }
      return parseCloze(params.cloze);
    }
    case 'HIGHLIGHT': {
      if (!params.highlight) {
        return { ok: false, error: 'Missing highlight payload.' };
      }
      return parseHighlight(params.highlight);
    }
    case 'DRAG_DROP': {
      if (!params.dragDrop) {
        return { ok: false, error: 'Missing drag-drop payload.' };
      }
      return parseDragDrop(params.dragDrop);
    }
  }
}
