// mynclex/lib/practice/cat/report-derive.ts
//
// The pure derivations behind the CAT results page (§13). No database, no
// clock, no randomness — everything here is a function of rows the loader
// already read, which is what makes it unit-testable.
//
// Plan: bank-consumption-cat.html §13.2 (layout + the regions), §13.3 (the
// trajectory graph), §4.5 (the full-credit/partial-credit distinction that
// forces the category footnote).
//
// The one rule worth stating up front, because two regions disagree on
// purpose: the CATEGORY BREAKDOWN counts FULL-CREDIT answers only, while the
// ENGINE credited partial answers fractionally. That is not an inconsistency
// to fix — §13.2 requires the full-credit count and requires the page to say
// so. See CATEGORY_FOOTNOTE below.

import type { CatVerdict } from '@/lib/cat';

/** One administered question, flattened from the attempt tables. */
export interface CatReportItem {
  position: number;
  questionType: string;
  /** L1 client-needs category. Null/off-canonical rows bucket out. */
  category: string | null;
  /** The engine's ability estimate BEFORE this question was served. */
  thetaBefore: number | null;
  /** The engine's standard error BEFORE this question was served. */
  seBefore: number | null;
  /** True only on full credit (§4.5) — partial answers are false here. */
  isCorrect: boolean;
  scoreAwarded: number;
  marks: number;
  /** True when this question was a child of a case study. */
  isCaseChild: boolean;
  answered: boolean;
}

/** A point on the trajectory graph — one per administered question. */
export interface TrajectoryPoint {
  position: number;
  /** The ability estimate AFTER this question's answer. */
  theta: number;
  /** The standard error after this answer — drives the confidence band. */
  se: number;
  isCorrect: boolean;
  /** Partial credit: scored above zero but below full. */
  isPartial: boolean;
  isCaseChild: boolean;
  answered: boolean;
}

export interface CategoryRow {
  name: string;
  /** Questions seen in this category. */
  seen: number;
  /** Full-credit answers only (§4.5). */
  correct: number;
  /** correct / seen, 0..1. */
  frac: number;
}

export type ClinicalJudgmentBand = 'STRONG' | 'MIXED' | 'DEVELOPING';

export interface ClinicalJudgmentRead {
  band: ClinicalJudgmentBand;
  /** How many case children fed the read — the page states this. */
  itemsSeen: number;
  /** Distinct cases behind it. */
  casesSeen: number;
}

/**
 * The mandatory note under the category breakdown (§13.2, §4.5).
 *
 * TWO effects push these percentages below what a student expects, and the
 * note has to name both or the page looks like it is contradicting itself.
 *
 * 1. PARTIAL CREDIT (§4.5 — the effect §13.2 requires disclosing). "Correct"
 *    is full-credit-only, while the engine credited partial answers as a
 *    fraction. Without the note a student concludes their partials were
 *    thrown away. They were not.
 *
 * 2. ADAPTIVE DIFFICULTY (found 2026-07-20 against the first real CAT, and
 *    NOT anticipated by §13). A CAT serves questions at the edge of the
 *    student's ability, so by construction the success rate converges toward
 *    roughly half FOR EVERYONE, whatever their level. The first real run
 *    bears it out: mean item difficulty 0.765, ability 0.48, so Rasch
 *    predicts ~43% and the student scored 41.6% — a correct, above-standard
 *    performance that still displays as 19-48% per category.
 *
 * The second effect is the larger one and dwarfs the first. A page that
 * showed "19%" beside "Above standard — 98% confident" without explaining
 * why would read as broken, and the student would trust the small number
 * over the verdict.
 */
export const CATEGORY_FOOTNOTE =
  'Two things make these percentages read lower than you might expect. ' +
  '“Correct” counts full-credit answers only — where you earned partial credit, ' +
  'say 3 of 5 on a Select-All, the engine still counted that fraction toward your ' +
  'ability estimate. And a CAT deliberately serves questions at the edge of what ' +
  'you can do, so these scores sit near half for everyone, at every level. ' +
  'Compare the categories against each other, not against 100%.';

/**
 * The clinical-judgment banding.
 *
 * PROVISIONAL. §13.2 specifies that a clinical-judgment read is shown and
 * gives one example label ("strong"), but never defines the bands or their
 * thresholds. These are a first proposal, chosen to be defensible rather
 * than tuned: a student who takes most case questions cleanly reads strong,
 * one who takes fewer than half reads developing, and the middle is mixed.
 * Revisit once real case-performance data exists (§5/§17).
 */
const CJ_STRONG_AT = 0.75;
const CJ_DEVELOPING_BELOW = 0.5;

/**
 * The read needs enough case questions to mean something. A CAT schedules
 * three cases (§7.4), so a complete exam clears this comfortably; a CAT that
 * ended before its first case does not, and gets no badge rather than a
 * badge computed from one answer.
 */
const CJ_MIN_ITEMS = 3;

/**
 * Rebuild the ability trace from the per-item snapshots.
 *
 * The engine stores theta BEFORE each question (`cat_theta_before`), because
 * that is what it knew when it chose the item. The graph wants the estimate
 * AFTER each answer — so each point takes the NEXT item's "before" value,
 * and the last point takes the attempt's final theta. That shift is the
 * whole trick, and getting it wrong silently draws a graph that lags one
 * question behind the truth.
 */
export function trajectoryPoints(
  items: readonly CatReportItem[],
  finalTheta: number,
  finalSe: number,
): TrajectoryPoint[] {
  const ordered = [...items].sort((a, b) => a.position - b.position);

  return ordered.map((item, i) => {
    const next = ordered[i + 1];
    const isLast = i === ordered.length - 1;

    // After THIS answer == before the NEXT question. On the last item there
    // is no next row, so the attempt's final estimate is the answer.
    const theta = isLast ? finalTheta : (next?.thetaBefore ?? finalTheta);
    const se = isLast ? finalSe : (next?.seBefore ?? finalSe);

    return {
      position: item.position,
      theta,
      se,
      isCorrect: item.isCorrect,
      isPartial: !item.isCorrect && item.scoreAwarded > 0,
      isCaseChild: item.isCaseChild,
      answered: item.answered,
    };
  });
}

/**
 * Client Needs breakdown — one row per category actually served.
 *
 * Categories the student never saw are omitted rather than shown as 0/0:
 * an empty row reads as a failure, when it only means the blueprint didn't
 * reach there before the exam stopped.
 */
export function categoryRows(items: readonly CatReportItem[]): CategoryRow[] {
  const byCategory = new Map<string, CatReportItem[]>();

  for (const item of items) {
    if (!item.category) continue;
    const bucket = byCategory.get(item.category);
    if (bucket) bucket.push(item);
    else byCategory.set(item.category, [item]);
  }

  const rows: CategoryRow[] = [];
  for (const [name, bucket] of byCategory) {
    const correct = bucket.filter((i) => i.isCorrect).length;
    rows.push({
      name,
      seen: bucket.length,
      correct,
      frac: bucket.length === 0 ? 0 : correct / bucket.length,
    });
  }

  // Weakest first — the page's job here is to point somewhere, and the
  // category that needs work should not be third in the list.
  return rows.sort((a, b) => a.frac - b.frac || b.seen - a.seen);
}

/**
 * The clinical-judgment read (§13.2) — a separate competency signal drawn
 * only from case-study children, mirroring how the NCLEX measures it.
 *
 * Returns null when the exam produced too few case questions to say
 * anything honest. The caller renders nothing in that case.
 */
export function clinicalJudgment(
  items: readonly CatReportItem[],
  caseCount: number,
): ClinicalJudgmentRead | null {
  const caseItems = items.filter((i) => i.isCaseChild);
  if (caseItems.length < CJ_MIN_ITEMS) return null;

  const correct = caseItems.filter((i) => i.isCorrect).length;
  const frac = correct / caseItems.length;

  const band: ClinicalJudgmentBand =
    frac >= CJ_STRONG_AT ? 'STRONG' : frac < CJ_DEVELOPING_BELOW ? 'DEVELOPING' : 'MIXED';

  return { band, itemsSeen: caseItems.length, casesSeen: caseCount };
}

/**
 * The "items administered" line (§13.2), worded for how the exam ended.
 *
 * Each termination reason gets its own sentence because they are different
 * facts: reaching confidence is the engine succeeding, while the ceiling and
 * the clock are the engine being cut off. One generic sentence would blur
 * that, and the ceiling case especially needs to read honestly next to a
 * high probability (§9.5).
 */
export function itemsAdministeredLine(
  items: number,
  reason: string | null,
  limitHours: number,
): string {
  if (reason === 'MAX_ITEMS_HIT') {
    return `You answered all ${items} questions — the exam’s maximum length.`;
  }
  if (reason === 'TIME_LIMIT_HIT') {
    return `You answered ${items} questions before the ${limitHours}-hour time limit.`;
  }
  return `You answered ${items} questions. The engine reached confidence at question ${items}.`;
}

/**
 * Format the readiness probability for display.
 *
 * Caps at ">99%" rather than printing 99.999%. On today's three-rung
 * difficulty ladder (§7.7) the probability saturates for anyone clearly
 * above the standard, and a spuriously precise number invites more trust
 * than the estimate has earned. The cap is honest at any spread and stops
 * being load-bearing once recalibration (§10.5) widens the ladder.
 */
export function formatProbability(p: number): string {
  const pct = p * 100;
  if (pct >= 99) return '>99%';
  if (pct <= 1) return '<1%';
  return `~${Math.round(pct)}%`;
}

/** Verdict headline (§13.1) — fixed copy. */
export function verdictHeadline(verdict: CatVerdict): string {
  return verdict === 'ABOVE_STANDARD' ? 'Above standard' : 'Below standard';
}

/**
 * True when the result sits close enough to the standard that the confident
 * sub-line would overstate it (§13.1's near-boundary framing).
 */
export function isNearBoundary(probability: number): boolean {
  return probability > 0.4 && probability < 0.6;
}

/** Verdict sub-line (§13.1) — fixed copy, including the near-boundary variant. */
export function verdictSubline(verdict: CatVerdict, probability: number): string {
  if (isNearBoundary(probability)) {
    return 'This was close — your ability sat right around our standard. The category breakdown below is where to focus.';
  }
  const label = formatProbability(probability);
  return verdict === 'ABOVE_STANDARD'
    ? `We’re ${label} confident you’re performing at a passing level on our exam.`
    : `We’re ${label} confident you’re above our standard — more practice recommended.`;
}

/** Verdict body (§13.1) — fixed copy. */
export function verdictBody(verdict: CatVerdict, probability: number): string {
  if (verdict === 'BELOW_STANDARD' || isNearBoundary(probability)) {
    return 'Use the category breakdown below to see where to focus, then come back for another CAT in a few days.';
  }
  return 'Your performance suggests you’re tracking ready. Keep practising to maintain it — consistent CAT performance is what matters most.';
}
