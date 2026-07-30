// mynclex/lib/scoring/rules-copy.ts
//
// One student-facing sentence per question type, saying how that type's
// marks were calculated. Shown in the review scoring strip.
//
// ⚠ This is the FIRST time the product tells a student how their marks
// were worked out. Until now the rules existed only as comments in
// functions.ts, read by nobody outside the codebase.
//
// The sentence is not free text — it makes a claim, and the claim is
// checked. Each rule carries `penalisesWrongPicks`, and rules-copy.test.ts
// runs the REAL scoring function for every type and asserts the score
// actually moves (or doesn't) the way the sentence says it does. So the
// wording cannot quietly outlive the maths: change SATA to stop
// subtracting for a wrong pick and the test fails, rather than the strip
// carrying on telling students about a penalty that no longer exists.
//
// Seven sentences across eleven types. The scoring functions behind them
// (dispatch.ts) are:
//   scoreAllOrNothing  → MCQ, TF
//   scorePlusMinus     → SATA, SELECT_N, HIGHLIGHT
//   scorePerRow        → MATRIX
//   scorePerRowMulti   → MATRIX_MR
//   scorePerBlank      → CLOZE
//   scorePerSlot       → DRAG_CLOZE, DRAG_ORDER
//   (inlined per-wing) → BOWTIE
//
// ⚠ The sentences do NOT group one-to-one with those functions, and it
// would be wrong to make them. Cloze and Drag-cloze read alike across two
// different functions (a student sees blanks in a sentence either way);
// Drag-cloze and Drag-to-order share one function and read differently
// (blanks vs slots). The maths fixes the CLAIM; what the student is
// looking at fixes the NOUN.
//
// The copy is Sam's, settled 2026-07-30 after a pass over all seven.
// The alternative considered and rejected was the notation the canonical
// doc itself uses ("0/1 per row", "+/− with floor 0") — precise, shorter,
// and our own house vocabulary, but it needs a key, the only place to put
// a key is a hover, and our students are on phones. Spending a line of
// wrapping beats spending a line of comprehension.

import type { QuestionType } from '@/lib/bank/classifications';

export interface ScoringRule {
  /** One short sentence for the strip. Sentence case, no full stop. */
  text: string;
  /**
   * Does a pick outside the answer key actively SUBTRACT, as opposed to
   * simply not adding? A machine-checkable claim — see the test.
   */
  penalisesWrongPicks: boolean;
}

// The two shared sentences, named so that types given the same wording
// are visibly sharing one constant rather than coincidentally matching
// strings.
const ALL_OR_NOTHING: ScoringRule = {
  text: 'All or nothing',
  penalisesWrongPicks: false,
};

const PLUS_MINUS: ScoringRule = {
  text: '+1 per correct, −1 per wrong, never below 0',
  penalisesWrongPicks: true,
};

export const SCORING_RULE: Record<QuestionType, ScoringRule> = {
  MCQ: ALL_OR_NOTHING,
  TF:  ALL_OR_NOTHING,

  SATA:      PLUS_MINUS,
  SELECT_N:  PLUS_MINUS,
  HIGHLIGHT: PLUS_MINUS,

  MATRIX: {
    text: '1 mark per row you match',
    penalisesWrongPicks: false,
  },

  // A stack of SATA rows: the +/− runs INSIDE each row and floors there,
  // then the rows are summed. So the sentence is deliberately PLUS_MINUS's
  // with one qualifier in front — it does not merely describe the
  // relationship to SATA, it is that relationship, which is what a student
  // meeting the two rules on consecutive questions needs to see. What the
  // prefix buys them: a row that goes badly bottoms out at 0 and cannot
  // eat into the marks another row earned. (Sam's wording, 2026-07-30 —
  // 19 chars shorter than the version that spelled it out.)
  MATRIX_MR: {
    text: 'Per row — +1 per correct, −1 per wrong, never below 0',
    penalisesWrongPicks: true,
  },

  CLOZE: {
    text: '1 mark per blank you fill correctly',
    penalisesWrongPicks: false,
  },

  DRAG_CLOZE: {
    text: '1 mark per blank you fill correctly',
    penalisesWrongPicks: false,
  },

  DRAG_ORDER: {
    text: '1 mark per slot you place correctly',
    penalisesWrongPicks: false,
  },

  // The wing structure (2 actions, 1 condition, 2 parameters) used to be
  // spelled out here and was dropped: it describes the question's SHAPE,
  // which is on screen in front of the student, not how it was marked.
  BOWTIE: {
    text: '1 mark per correct tile',
    penalisesWrongPicks: false,
  },
};

/** The sentence shown under the score for this question type. */
export function scoringRuleText(questionType: QuestionType): string {
  return SCORING_RULE[questionType].text;
}
