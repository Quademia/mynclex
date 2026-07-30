// mynclex/lib/practice/report/types.ts
//
// The Session Report — the permanent per-sitting report for a Builder-built
// practice attempt (CUSTOM_BUILT, any mode except CAT).
//
// WHY THIS EXISTS: a readiness pack and a CAT each have a permanent report
// page. A practice quiz had only the end-of-quiz popup — a moment, not a
// destination — after which the sole artifact was re-entering the runner.
// The dashboard's recent rail even said so in a comment: "A finished
// practice quiz has no standalone report surface today."
//
// WHAT IT DELIBERATELY IS NOT: banded, predictive, or compared to other
// students. Those belong to Readiness Packs and CAT. A practice set has no
// pass mark, so a verdict here would be invented — this is a debrief of one
// sitting. The wording under the score says so on the page itself.

import type { FilterPayload } from '@/lib/practice/builder/types';

/** How one question in the sitting turned out.
 *
 *  NOT_ANSWERED is kept separate from NONE even though the summary card
 *  merges them ("All wrong or skipped"), because the per-question table
 *  must not show a skipped question as a wrong one — the same distinction
 *  that made a bare percentage misleading on the History page. */
export type QuestionOutcome = 'FULL' | 'PARTIAL' | 'NONE' | 'NOT_ANSWERED';

export interface ReportQuestion {
  /** 1-based position in the sitting, as served. */
  position: number;
  itemId: string;
  questionType: string;
  /** The frozen classification (subject, client needs, difficulty, …). Read
   *  from the attempt's own snapshot, so the report keeps working after a
   *  curator re-classifies or retires the question. */
  classification: Record<string, unknown>;
  /** Stem text, snapshotted. Slice 3 renders it; slice 1 doesn't. */
  stem: string | null;
  /** Max partial-credit score for this question — its `marks`. */
  marks: number;
  /** What the student actually scored. Null when never submitted. */
  scoreAwarded: number | null;
  submissionStatus: string | null;
  /** Engaged seconds on this question, or null when not recorded. Timing
   *  arrived late in the product's life, so most older sittings have none. */
  timeSpentSec: number | null;
  /** How many times the answer was changed before submitting. */
  answerChanges: number;
}

export interface SessionReport {
  attemptId: string;
  /** When the sitting was taken. */
  createdAt: string;
  modeLabel: string;
  /** "Pharmacology + Med-Surg · Hard · Unseen · 25 Q" — the same summary the
   *  History row shows, from the same helper, so the two cannot disagree. */
  summary: string;
  /** The saved build, for the "Build the same again" deep link. */
  filters: FilterPayload;
  /** Item-equivalent average, 0–1, partial credit included. The SAME number
   *  History shows — deliberately not recomputed here. */
  scoreFraction: number | null;
  questions: ReportQuestion[];
  /** Attempt-level engaged time when the runner recorded it. Usually null on
   *  older sittings; the derive layer falls back to summing per-question. */
  engagedSeconds: number | null;
}

/** Why a report could not be shown. The page maps each to a destination
 *  rather than a message — every one of these has a better place to be. */
export type ReportGateReason =
  | 'not_found'
  | 'in_progress'
  | 'discarded'
  | 'wrong_kind';

export type SessionReportResult =
  | { ok: true; report: SessionReport }
  | {
      ok: false;
      reason: ReportGateReason;
      attemptId: string;
      /** Where this sitting's report actually lives, when it has one
       *  elsewhere. Set for 'wrong_kind' — a pack or a CAT arriving here
       *  should land on its own report, not be dumped at the index. */
      redirectTo?: string;
    };
