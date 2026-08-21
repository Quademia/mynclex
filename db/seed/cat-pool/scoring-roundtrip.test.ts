// db/seed/cat-pool/scoring-roundtrip.test.ts
//
// End-to-end proof for the CAT test-pool builder: every synthetic item the
// builder emits must round-trip through the REAL runner scoring engine.
//
// For each sample item, we:
//   1. assemble it via the builder (the same code path the seed uses),
//   2. build the fully-correct student answer,
//   3. run it through scoreAttempt + computeMarksFromKey from @/lib/scoring,
//   4. assert score_awarded === marks and is_correct === true.
//
// If this passes, the runner will score these items without throwing
// (a mismatched `marks` is exactly what makes the submit RPC reject an item).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { computeMarksFromKey, scoreAttempt } from '@/lib/scoring';
import { assemble, computeMarks } from './build.mjs';
import type { BankItemAnswer } from '@/lib/scoring';

const here = dirname(fileURLToPath(import.meta.url));
// The two `any`s below are deliberate, and a "proper" type would be worse.
// Both values hold a DIFFERENT SHAPE per question type — `correct.answer` for
// MCQ, `correct.cells` for MATRIX, `correct.left/centre/right` for BOWTIE, and
// so on. The union that describes that honestly is `BankItemCorrect`, and
// `tsc` already rejects it here on lines 47 and 52 for precisely this reason:
// a value narrowed to one variant is not assignable to the union. Naming a
// type that TypeScript is telling us does not fit would document a shape this
// fixture does not have. The `any` says "heterogeneous by design", which is true.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sample = JSON.parse(readFileSync(join(here, 'data', '_sample.json'), 'utf8')) as any[];

// Build the fully-correct answer for an assembled item, per @/lib/scoring types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fullyCorrect(type: string, correct: any): BankItemAnswer {
  switch (type) {
    case 'MCQ': case 'TF': return correct.answer;
    case 'SATA': case 'SELECT_N': return correct.answers;
    case 'HIGHLIGHT': return correct.correct_ids;
    case 'MATRIX': return { ...correct.cells };
    case 'MATRIX_MR': return Object.fromEntries(Object.entries(correct.cells).map(([r, c]) => [r, [...(c as string[])]]));
    case 'CLOZE': return { ...correct.answers };
    case 'DRAG_CLOZE': case 'DRAG_ORDER': return { ...correct.slots };
    case 'BOWTIE': return { left: [...correct.left], centre: correct.centre, right: [...correct.right] };
    default: throw new Error(`no answer builder for ${type}`);
  }
}

describe('CAT pool builder → real scoring engine round-trip', () => {
  for (const def of sample) {
    it(`${def.type} (${def.item_id}) scores full credit`, () => {
      const { content, correct } = assemble(def);

      // 1. builder marks agree with the runner's own marks derivation
      const runnerMarks = computeMarksFromKey(def.type, correct);
      expect(computeMarks(def.type, correct)).toBe(runnerMarks);

      // 2. a fully-correct answer earns exactly `marks` and reads as correct
      const answer = fullyCorrect(def.type, correct);
      const result = scoreAttempt(def.type, correct, answer);
      expect(result.score_awarded).toBe(runnerMarks);
      expect(result.is_correct).toBe(true);

      // 3. content is non-empty (renderer has something to show)
      expect(content).toBeTruthy();
    });
  }
});
