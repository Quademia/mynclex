// mynclex/lib/practice/cases/types.ts
//
// Shapes for the student Case Study bank (/student/bank/cases).
//
// ⚠ CaseBankRow is what reaches the BROWSER. It deliberately carries no
// field naming WHY a case is locked (Sam, 2026-07-29: the student must
// not learn that our CAT pool / readiness packs exist). The RPC doesn't
// return a reason either — the omission is enforced at both layers, not
// just hidden in the UI. Don't add one here "for the tooltip".

/** Where a sitting came from. Decides where its entry links to. */
export type CaseAttemptOrigin =
  | 'CASE_BANK'   // sat from this page — 1 or 2 cases
  | 'READINESS'   // met inside a readiness pack
  | 'CAT'         // met inside a CAT sitting
  | 'PRACTICE'    // met in a Question Bank practice run
  | 'PROGRAMME';  // met in a tutor-assigned quiz

/** One finished sitting that contained this case. */
export interface CaseAttemptEntry {
  attemptId: string;
  /** ISO timestamp; null if the attempt never stamped ended_at. */
  endedAt: string | null;
  /** Item-equivalent average over this case's questions in that sitting. */
  pct: number;
  /** How many of the case's questions were actually submitted. */
  answered: number;
  /**
   * How many were put in front of the student. Normally 6 — but NOT
   * assumed: a CAT terminates on its own rules, not on case boundaries,
   * so it can stop partway through a case.
   */
  served: number;
  origin: CaseAttemptOrigin;
}

/** One row of the list, as sent to the client. */
export interface CaseBankRow {
  caseId: string;
  title: string;
  /** Reserved and not yet met by this student. No reason is given. */
  locked: boolean;
  /**
   * Has a FINISHED sitting from this page. Drives the grouping and the
   * Review button — deliberately narrower than "has met this case", so
   * Review can only ever open a 1- or 2-case run and never a
   * 100-question exam. Meeting a case in an exam still unlocks it; it
   * just lands in "Ready to sit" with its result kept in `history`.
   */
  satHere: boolean;
  /** Mid-sitting right now, from this page. */
  inProgress: boolean;
  /** Every finished sitting, newest first. Capped at 10 by the RPC. */
  history: CaseAttemptEntry[];
  /** True total, exact even when `history` is capped. */
  attemptsTotal: number;
  /**
   * Clinical axes derived from the six children, already assembled for
   * display ("Medical-Surgical · Endocrine"). Empty string when the
   * children carry no classification.
   */
  axes: string;
  /**
   * First ~2 lines of the scenario, plain text, revealed on row expand.
   * Null for locked rows — a locked case ships no scenario text at all,
   * because that is exam content.
   */
  snippet: string | null;
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
