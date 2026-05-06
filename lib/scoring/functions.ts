// mynclex/lib/scoring/functions.ts
//
// The five scoring functions per bank-marks-and-scoring.html §3.
// Pure TS, deterministic, no DB calls. Each takes the rubric pieces it
// needs plus the student's picks and returns { score_awarded, is_correct, max }.
//
// is_correct is full-credit-only per §5.5 — the function itself decides
// what "full credit" means (no wrongs for +/−, every key matched for
// per-element rules).

interface Result {
  score_awarded: number;
  is_correct: boolean;
  max: number;
}

// Internal helper: shared math for the 0/1-per-element family
// (per-row, per-blank, per-slot). Each match contributes 1, summed.
// is_correct only when every element matched.
function sumPerElement(matches: boolean[]): Result {
  const max = matches.length;
  const score = matches.filter(Boolean).length;
  return { score_awarded: score, is_correct: score === max, max };
}

// scoreAllOrNothing — full marks if exactly correct, else 0.
// Used by: MCQ, TF.
export function scoreAllOrNothing(correctId: string, pickedId: string | null): Result {
  const right = pickedId !== null && pickedId === correctId;
  return { score_awarded: right ? 1 : 0, is_correct: right, max: 1 };
}

// scorePlusMinus — +1 per correct pick, −1 per wrong pick, floor 0.
// Max = correctIds.length. Defends against "select everything" gaming
// because every wrong pick subtracts.
// Used by: SATA, SELECT_N, HIGHLIGHT.
export function scorePlusMinus(correctIds: string[], pickedIds: string[]): Result {
  const correctSet = new Set(correctIds);
  const pickedSet = new Set(pickedIds);
  let plus = 0;
  let minus = 0;
  for (const pid of pickedSet) {
    if (correctSet.has(pid)) plus++;
    else minus++;
  }
  const max = correctIds.length;
  return {
    score_awarded: Math.max(0, plus - minus),
    is_correct: plus === max && minus === 0,
    max,
  };
}

// scorePerRow — 0/1 per row, summed. Max = number of rows in the rubric.
// Used by: MATRIX (single-response only in v1).
export function scorePerRow(
  correctCells: Record<string, string>,
  pickedCells: Record<string, string>,
): Result {
  const matches = Object.entries(correctCells).map(
    ([rowId, expected]) => pickedCells[rowId] === expected,
  );
  return sumPerElement(matches);
}

// scorePerBlank — 0/1 per blank, summed. Max = number of blanks.
// Used by: CLOZE (simple drop-down per blank in v1).
export function scorePerBlank(
  correctAnswers: Record<string, string>,
  pickedAnswers: Record<string, string>,
): Result {
  const matches = Object.entries(correctAnswers).map(
    ([blankId, expected]) => pickedAnswers[blankId] === expected,
  );
  return sumPerElement(matches);
}

// scorePerSlot — 0/1 per slot, summed. Max = number of slots.
// Used directly by: DRAG_DROP (single-token-per-slot).
// BOWTIE conceptually applies the same rule (per-wing 0/1 tally summed)
// but its rubric shape is array+scalar+array, not Record. Bowtie scoring
// is inlined in dispatch.ts using the same per-element math.
export function scorePerSlot(
  correctSlots: Record<string, string>,
  pickedSlots: Record<string, string>,
): Result {
  const matches = Object.entries(correctSlots).map(
    ([slotId, expected]) => pickedSlots[slotId] === expected,
  );
  return sumPerElement(matches);
}
