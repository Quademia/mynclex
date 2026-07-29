// mynclex/lib/practice/cases/types.ts
//
// Shapes for the student Case Study bank (/student/bank/cases).
//
// ⚠ CaseBankRow is what reaches the BROWSER. It deliberately carries no
// field naming WHY a case is locked (Sam, 2026-07-29: the student must
// not learn that our CAT pool / readiness packs exist). The RPC doesn't
// return a reason either — the omission is enforced at both layers, not
// just hidden in the UI. Don't add one here "for the tooltip".

/** The student's most recent FINISHED sitting containing this case. */
export interface CaseLastAttempt {
  /** Review target — /session/[attemptId] renders in review mode. */
  attemptId: string;
  /** Item-equivalent-average percent over this case's six children. */
  pct: number;
  /** ISO timestamp; null if the attempt somehow never stamped ended_at. */
  endedAt: string | null;
}

/** One row of the list, as sent to the client. */
export interface CaseBankRow {
  caseId: string;
  title: string;
  /** Reserved and not yet met by this student. No reason is given. */
  locked: boolean;
  /**
   * This student has met the case before (in any sitting). Distinct from
   * `last`: a case met in a sitting still IN_PROGRESS is seen with no
   * finished attempt to review.
   */
  seen: boolean;
  /**
   * Clinical axes derived from the six children, already assembled for
   * display ("Medical-Surgical / Pharmacology · Endocrine"). Empty string
   * when the children carry no classification.
   */
  axes: string;
  /**
   * First ~2 lines of the scenario, plain text, revealed on row expand.
   * Null for locked rows — a locked case ships no scenario text at all,
   * because that is exam content.
   */
  snippet: string | null;
  last: CaseLastAttempt | null;
}

/** The three STUDY modes this surface offers. */
export type CaseBankMode = 'UNTIMED_LEARNING' | 'UNTIMED_TEST' | 'TIMED_FREE_NAV';

/** Which group a row falls into. Locked rows are always last. */
export type CaseGroupKey = 'ready' | 'attempted' | 'unavailable';

export interface CaseGroup {
  key: CaseGroupKey;
  title: string;
  rows: CaseBankRow[];
}

/** The "Attempted / Not attempted" segmented filter. */
export type CaseFilterId = 'all' | 'new' | 'done';

/** Questions per case — fixed by the schema (position BETWEEN 1 AND 6). */
export const QUESTIONS_PER_CASE = 6;

/** Ceiling on a single run. Picking one case is perfectly valid. */
export const MAX_CASES_PER_RUN = 2;
