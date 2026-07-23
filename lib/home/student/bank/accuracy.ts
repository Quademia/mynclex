// mynclex/lib/home/student/bank/accuracy.ts
//
// Whole-history accuracy for the Bank Dashboard — the eight blueprint
// bars (card 6), the weakest-area nudge (card 5), and the overall
// figure the readiness panel's accuracy signal reads (card 8).
//
// ── The level correction ──────────────────────────────────────
// The plan called these "the 8 L1 category bars". There are only FOUR
// L1 client-needs categories (Safe and Effective Care Environment,
// Health Promotion and Maintenance, Psychosocial Integrity,
// Physiological Integrity). The EIGHT the design draws — and the eight
// every NCLEX candidate recognises — are the L2 SUBCATEGORIES. So the
// bars and the nudge both work at L2, which is also the level
// weakestSubcategory() and the practice builder's ?subcat= deep link
// already speak.
//
// ── What counts ───────────────────────────────────────────────
//   • Answered questions only (SUBMITTED / AUTO_SUBMITTED).
//   • Bank sources only — programme-assigned work is the programme
//     home's business.
//   • CAT EXCLUDED. A CAT serves at the edge of the student's ability,
//     so raw correctness converges toward ~50% for everyone at every
//     level (§13.2, found on real data). Letting CAT in would drag
//     every bar toward the middle and make a strong student look
//     average. Contrast the streak, where a CAT counts fine — it is
//     study, it is just not a measurement of mastery.
//   • Repeats count every answered occurrence (v1 decision).
//   • "Correct" is fully-correct, the same all-or-nothing reading the
//     readiness report uses — a part-marked SATA is not a win here.

import {
  CLIENT_NEEDS_CATEGORIES,
  CLIENT_NEEDS_SUBCATEGORIES,
} from '@/lib/bank/classifications';

/** One answered question, reduced to what accuracy needs. */
export type AnsweredRow = {
  subcategory: string | null;
  isCorrect: boolean;
};

export type MasteryBar = {
  name: string;
  answered: number;
  correct: number;
  /** 0–100, rounded. */
  percent: number;
};

export type BankAccuracy = {
  /** Every answered non-CAT bank question, classified or not. */
  answered: number;
  correct: number;
  /** 0–100, or null when nothing has been answered. */
  percent: number | null;
  /** The blueprint bars, strongest first (the design's order). Only
   *  subcategories the student has actually seen appear. */
  bars: MasteryBar[];
  /** The denominator BEHIND the bars — smaller than `answered` when
   *  older attempts snapshotted no subcategory. Labelled on the card
   *  so the bars never borrow a volume they didn't come from. */
  barsAnswered: number;
  /** Weakest bar — card 5's nudge. Null before the cold-start gate. */
  weakest: MasteryBar | null;
  /** Have we enough classified answers to draw a mastery map at all? */
  hasEnough: boolean;
};

/**
 * Cold-start gate for the bars + nudge. Below this we say "keep
 * practising" rather than draw a map out of a handful of questions.
 * Deliberately much lower than the readiness panel's evidence gate:
 * this only has to be enough to be worth looking at, not enough to
 * support a readiness claim.
 */
export const MASTERY_MIN_ANSWERED = 20;

/** The eight blueprint subcategories, in NCLEX's own order. */
export const BLUEPRINT_SUBCATEGORIES: string[] = CLIENT_NEEDS_CATEGORIES.flatMap(
  (cat) => CLIENT_NEEDS_SUBCATEGORIES[cat],
);

export function bankAccuracy(rows: AnsweredRow[]): BankAccuracy {
  const answered = rows.length;
  const correct = rows.filter((r) => r.isCorrect).length;

  // Only canonical subcategories become bars. Off-canonical values do
  // exist in older snapshots (a nursing-subject value that landed in
  // the subcategory field), and a ninth bar named something no student
  // would recognise as a blueprint area would confuse more than it
  // informs — those rows stay in the overall figure and out of the map.
  const canonical = new Set(BLUEPRINT_SUBCATEGORIES);
  const tally = new Map<string, { answered: number; correct: number }>();
  for (const r of rows) {
    if (!r.subcategory || !canonical.has(r.subcategory)) continue;
    const t = tally.get(r.subcategory) ?? { answered: 0, correct: 0 };
    t.answered += 1;
    if (r.isCorrect) t.correct += 1;
    tally.set(r.subcategory, t);
  }

  const bars: MasteryBar[] = BLUEPRINT_SUBCATEGORIES.filter((name) => tally.has(name)).map(
    (name) => {
      const t = tally.get(name)!;
      return {
        name,
        answered: t.answered,
        correct: t.correct,
        percent: Math.round((t.correct / t.answered) * 100),
      };
    },
  );

  const barsAnswered = bars.reduce((sum, b) => sum + b.answered, 0);
  const hasEnough = barsAnswered >= MASTERY_MIN_ANSWERED;

  // Weakest = lowest percentage, breaking ties toward the bar with more
  // questions behind it (the more certain weakness).
  const weakest = hasEnough
    ? bars.reduce<MasteryBar | null>(
        (worst, b) =>
          !worst || b.percent < worst.percent || (b.percent === worst.percent && b.answered > worst.answered)
            ? b
            : worst,
        null,
      )
    : null;

  return {
    answered,
    correct,
    percent: answered ? Math.round((correct / answered) * 100) : null,
    // Strongest first, as the design draws it — the weakest is already
    // called out by name in the nudge card directly above.
    bars: [...bars].sort((a, b) => b.percent - a.percent || b.answered - a.answered),
    barsAnswered,
    weakest,
    hasEnough,
  };
}

/**
 * Bar colour band. Mirrors the design's thresholds; kept here rather
 * than in CSS so the row's accessible label and its colour can't drift
 * apart.
 */
export function barTone(percent: number): 'strong' | 'ok' | 'warn' | 'low' {
  if (percent >= 78) return 'strong';
  if (percent >= 70) return 'ok';
  if (percent >= 62) return 'warn';
  return 'low';
}
