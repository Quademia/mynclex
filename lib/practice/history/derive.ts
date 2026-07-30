// mynclex/lib/practice/history/derive.ts
//
// The plain rules for describing a past sitting: what KIND it was, WHERE
// it opens, and HOW its result is allowed to be stated.
//
// Why these live in one file rather than inside the table component:
// three surfaces already describe the same attempt row — the History
// list, the dashboard's recent rail, and the case bank's per-case
// history — and the first two were disagreeing. History sent every row
// into the runner and printed a percentage for everything; the rail
// routed by kind and refused a percentage on a CAT. One of them was
// wrong, and nothing in the code said which.
//
// ⭐ Three kinds, three different sorts of result, and getting one wrong
// puts a number on screen that the surface it links to contradicts:
//
//   • a practice quiz  → a percentage, stated not judged. A practice set
//     has no pass mark, so a verdict here would be invented.
//   • a readiness pack → the BAND WORD it earned (Building / Approaching
//     / Ready / Excelling). Our packs have no pass/fail at all, so a
//     percentage would be a scale the student never saw on their report.
//   • a CAT            → the verdict, which is BINARY (above or below
//     standard — there is no "At"), routed through the shared
//     isUnmeasured() so a sitting that ran out of time under the item
//     minimum reads the same here as on its own result page.
//
// §13.5 is the hard one: a raw percentage must NEVER front a CAT. A CAT
// serves questions at the edge of ability, so raw correctness converges
// toward half for everyone — the first real CAT read 41.6% under a
// 98%-confident pass. Printed as the result, that number tells a passing
// student she failed.

import { scoreToBand } from '@/lib/payments/readiness-band';
import { isUnmeasured, UNMEASURED_SHORT_LABEL } from '@/lib/practice/cat/report-derive';
import { summariseRecent } from '@/lib/practice/launchers/summarise-recent';
import type { AnswerStats, HistoryAttempt } from './types';

/**
 * Makes a typed search term safe to drop into PostgREST's `or=` argument.
 *
 * That argument is a comma-separated list wrapped in parentheses, so a
 * comma, bracket or wildcard inside the term is read as SYNTAX — it would
 * either break the query or, worse, quietly change which rows match. They
 * are stripped rather than escaped because none of them are meaningful
 * inside a classification value, and stripping keeps the rest of the term
 * searchable instead of failing the whole query.
 *
 * Lives here, with the other pure helpers, so it can be tested: queries.ts
 * imports the server-only Supabase client and can't be loaded in a test.
 */
export function sanitiseSearchTerm(term: string): string {
  return term.replace(/[(),*]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** What sort of sitting this row is. `source` alone cannot tell you: a
 *  CAT is stored as CUSTOM_BUILT with mode 'CAT', so the mode has to be
 *  checked first or every CAT reads as a practice quiz. */
export type SittingKind = 'CAT' | 'PACK' | 'PRACTICE';

export function sittingKind(row: HistoryAttempt): SittingKind {
  if (row.mode === 'CAT') return 'CAT';
  if (row.source === 'READINESS_PACK') return 'PACK';
  return 'PRACTICE';
}

/** Same three tones the dashboard rail uses, so a shared describeOutcome
 *  needs no translation layer between the two surfaces. */
export type OutcomeTone = 'good' | 'neutral' | 'low';

export interface HistoryOutcome {
  label: string;
  tone: OutcomeTone;
}

/**
 * The result of a FINISHED sitting, in the vocabulary that sitting's own
 * report uses. Null when there is no result to state yet (unfinished, or
 * a CAT that stopped before reaching a verdict) — the caller's state
 * column carries that instead.
 *
 * `stats` is optional so the dashboard rail can call this without paying
 * for the extra per-attempt reads. Passing it adds one rule: a sitting
 * where nothing was answered reports "Not answered" instead of a score,
 * because a score over unanswered questions conflates "did badly" with
 * "didn't do it" — 0 of 6 and a genuine zero render identically
 * otherwise, and only one of them is a result.
 */
export function describeOutcome(
  row: HistoryAttempt,
  stats?: AnswerStats | null,
): HistoryOutcome | null {
  const kind = sittingKind(row);

  // CAT first — see sittingKind(). A CAT has its own idea of "didn't get
  // far enough" (isUnmeasured), so the not-answered rule below is not
  // applied to it; two competing ways of saying the same thing would
  // disagree at the boundary.
  if (kind === 'CAT') {
    if (isUnmeasured(row.cat_termination_reason, row.cat_items_administered ?? 0)) {
      return { label: UNMEASURED_SHORT_LABEL, tone: 'low' };
    }
    if (row.cat_verdict === 'ABOVE_STANDARD') return { label: 'Above standard', tone: 'good' };
    if (row.cat_verdict === 'BELOW_STANDARD') return { label: 'Below standard', tone: 'low' };
    return null; // stopped before a verdict existed
  }

  if (row.final_score === null) return null;

  // Nothing attempted — say so instead of scoring the silence. Neutral,
  // never the danger tone: not answering is not a bad result, it is the
  // absence of one.
  if (stats && stats.served > 0 && stats.answered === 0) {
    return { label: 'Not answered', tone: 'neutral' };
  }

  if (kind === 'PACK') {
    const band = scoreToBand(row.final_score);
    if (!band) return null;
    // Ready and Excelling are the achievement bands; the lower two are
    // stated plainly rather than alarmingly — a pack is a diagnostic.
    const tone: OutcomeTone =
      band.key === 'EXCELLING' || band.key === 'READY' ? 'good' : 'neutral';
    return { label: band.label, tone };
  }

  return { label: `${Math.round(row.final_score * 100)}%`, tone: 'neutral' };
}

/**
 * The partial-completion line that sits under the result, e.g.
 * "8 of 20 answered". Null when it would say nothing useful — a fully
 * answered sitting, an unfinished one (the state pill already covers
 * that), or one we have no counts for.
 *
 * Deliberately absent for a CAT: a CAT is variable-length by design, so
 * "answered N of N" is always trivially true and "of" implies a target
 * that never existed.
 */
export function answeredDetail(
  row: HistoryAttempt,
  stats?: AnswerStats | null,
): string | null {
  if (!stats || sittingKind(row) === 'CAT') return null;
  if (row.status === 'IN_PROGRESS') return null;
  if (stats.served <= 0) return null;
  if (stats.answered >= stats.served) return null;
  return `${stats.answered} of ${stats.served} answered`;
}

// ── Row actions ───────────────────────────────────────────────
//
// A finished sitting offers TWO, uniformly across all three kinds: its
// REPORT, and REVIEW of the answers. They are genuinely different
// destinations and a student wants one or the other, so collapsing them into
// one link meant guessing which.
//
// It used to be a single action whose destination depended on kind — the
// report for a pack and a CAT, the runner for a practice quiz. Which left the
// practice report reachable only by clicking the result cell, i.e. not
// discoverable, while the other two advertised theirs plainly.

/** Pick up an unfinished sitting. Null once it is finished or discarded. */
export function resumeHref(row: HistoryAttempt): string | null {
  return row.status === 'IN_PROGRESS' ? `/session/${row.attempt_id}` : null;
}

/**
 * Walk the answers in the runner's review mode.
 *
 * Null when there is nothing to review yet (unfinished — that is Resume's
 * job), when the sitting was discarded, or — the one asymmetric case — when a
 * readiness pack's answer-review window has closed.
 *
 * ⚠ THE PACK WINDOW IS LOAD-BEARING. `/session/[id]` reads the pack's
 * `expires_at` and redirects to the pack report once it is past, so offering
 * Review on an old pack row would produce exactly the bounce link the
 * dashboard rail was fixed for an hour earlier. A pack's SCORE lasts forever;
 * only its answers expire.
 *
 * @param packReviewOpen for a pack, ONLY an explicit `true` opens review.
 *   Null and false are both closed — mirroring the runner, which does
 *   `reviewWindowOpen(credit?.expires_at ?? null)` and so treats a MISSING
 *   credit row as expired. ⚠ Measured on dev: most pack attempts have no
 *   credit row linked at all, so a permissive default here would have offered
 *   Review on nearly every pack row and bounced every one of them. Fail
 *   closed, and let the report — which is permanent — carry the sitting.
 */
export function reviewHref(
  row: HistoryAttempt,
  packReviewOpen: boolean | null,
): string | null {
  if (row.status === 'ABANDONED' || row.status === 'IN_PROGRESS') return null;
  if (sittingKind(row) === 'PACK' && packReviewOpen !== true) return null;
  return `/session/${row.attempt_id}`;
}

/** True when Review is missing BECAUSE the pack window closed, as opposed to
 *  simply not applying. The row then shows a disabled control with a reason
 *  rather than silently dropping the option, so the rule is learnable. */
export function reviewClosedForPack(
  row: HistoryAttempt,
  packReviewOpen: boolean | null,
): boolean {
  return (
    sittingKind(row) === 'PACK' &&
    packReviewOpen !== true &&
    row.status !== 'IN_PROGRESS' &&
    row.status !== 'ABANDONED'
  );
}

export const REVIEW_CLOSED_REASON =
  'The 21-day answer review window for this pack has closed — its report stays available.';

/**
 * The permanent REPORT for this sitting, when it has one.
 *
 * All three kinds now do, since a practice quiz got its own report page —
 * which is what let the row settle on one uniform pair of actions. Null while
 * a sitting is unfinished or discarded: there is nothing to report yet.
 */
export function reportHref(row: HistoryAttempt): string | null {
  if (row.status === 'ABANDONED' || row.status === 'IN_PROGRESS') return null;

  switch (sittingKind(row)) {
    case 'CAT':      return `/student/bank/cat/result/${row.attempt_id}`;
    case 'PACK':     return `/student/bank/packs/report/${row.attempt_id}`;
    case 'PRACTICE': return `/student/bank/session/report/${row.attempt_id}`;
  }
}

/**
 * What to call the report link.
 *
 * Uniform "Report" rather than each page's own name ("CAT result", "Pack
 * report"): the actions now sit in a fixed pair on every row, and a column
 * where the same position reads three different words is harder to scan than
 * one that always says the same thing. The row's Type pill already says which
 * kind of sitting it is.
 */
export function reportLinkLabel(): string {
  return 'Report';
}

/**
 * The one-line description of what the sitting WAS.
 *
 * Only a practice quiz gets the filter summary, because only a practice
 * quiz was built from filters. A pack and a CAT store no subject axis, so
 * running them through the same summariser produced a bare "25 Q" — the
 * least informative thing on the row.
 */
export function sittingSummary(row: HistoryAttempt): string {
  switch (sittingKind(row)) {
    case 'CAT': {
      const n = row.cat_items_administered;
      return n && n > 0 ? `CAT sitting · ${n} items` : 'CAT sitting';
    }
    case 'PACK':
      return 'Readiness pack';
    case 'PRACTICE':
      return summariseRecent(row.filters_json, row.actual_count ?? row.requested_count);
  }
}

/**
 * May this sitting be discarded?
 *
 * Mirrors `nclex_discard_attempt` exactly — the database is the enforcer
 * (a student has no UPDATE permission on the attempts table at all), and
 * this decides whether the button is offered. Keeping them in step is the
 * point of writing the rule down twice; an offered button that the
 * database then refuses is worse than no button.
 *
 * PRACTICE ONLY, deliberately:
 *   • a finished sitting is a record with a report attached
 *   • a readiness pack is a paid one-shot — discarding forfeits a credit,
 *     far too consequential for a two-click confirm in a list
 *   • a CAT is an exam with its own lifecycle and its own surface
 * All 36 stale sittings measured on dev are practice quizzes, so this
 * covers the whole of the actual problem.
 */
export function canDiscard(row: HistoryAttempt): boolean {
  return row.status === 'IN_PROGRESS' && sittingKind(row) === 'PRACTICE';
}

/** The word for what this sitting was, for the type pill. */
export function sittingKindLabel(kind: SittingKind): string {
  switch (kind) {
    case 'CAT':      return 'CAT';
    case 'PACK':     return 'Pack';
    case 'PRACTICE': return 'Practice';
  }
}
