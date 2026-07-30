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
// Grouping mirrors dispatch.ts exactly (7 distinct rules across 11 types):
//   scoreAllOrNothing  → MCQ, TF
//   scorePlusMinus     → SATA, SELECT_N, HIGHLIGHT
//   scorePerRow        → MATRIX
//   scorePerRowMulti   → MATRIX_MR
//   scorePerBlank      → CLOZE
//   scorePerSlot       → DRAG_CLOZE, DRAG_ORDER
//   (inlined per-wing) → BOWTIE

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

// The two shared sentences, named so that types scored by the same
// function are visibly given the same wording rather than coincidentally
// matching strings.
const ALL_OR_NOTHING: ScoringRule = {
  text: 'All or nothing — full marks only for the exact answer',
  penalisesWrongPicks: false,
};

const PLUS_MINUS: ScoringRule = {
  text: '+1 per correct pick, −1 per wrong pick, never below 0',
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
  // then the rows are summed. Deliberately not borrowing SATA's sentence,
  // because "never below 0" means per row here, not per question.
  MATRIX_MR: {
    text: 'Each row scored +1 correct / −1 wrong, then the rows are added up',
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

  BOWTIE: {
    text: '1 mark per correct tile — 2 actions, 1 condition, 2 parameters',
    penalisesWrongPicks: false,
  },
};

/** The sentence shown under the score for this question type. */
export function scoringRuleText(questionType: QuestionType): string {
  return SCORING_RULE[questionType].text;
}
