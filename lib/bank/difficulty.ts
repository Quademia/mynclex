// ─────────────────────────────────────────────────────────────────────
// Difficulty — the single source of truth for the label ↔ number map and
// the student-facing display band. CAT Slice 10a.
// ─────────────────────────────────────────────────────────────────────
// Two numbers describe a question's difficulty:
//   • the curator's LABEL  (nclex_bank_items.difficulty, a word)
//   • the numeric VALUE    (difficulty_irt, on the Rasch logit scale)
// The label is what a curator authors; the value is what the CAT engine
// reads. This module holds the mapping between them and the rule for what
// difficulty a human is shown.
//
// Lives in lib/bank/ (not lib/practice/) because the curator save path
// (lib/bank/actions/save-question.ts) needs the seed map, and per the repo
// convention practice/ imports from bank/, never the reverse.
//
// See bank-consumption-cat.html §5.1 (seeds), §5.5 (display band).

import { type Difficulty } from './classifications';

// ── §5.1 — day-one seed: curator label → number ──────────────────────
// Five evenly-spaced points on the logit scale, one logit apart, where
// 0 = average ability. The extremes at ±2 sit where an average candidate
// succeeds ~88% (Very easy) / ~12% (Very hard) of the time.
export const DIFFICULTY_SEED_IRT: Record<Difficulty, number> = {
  'Very easy': -2.0,
  Easy: -1.0,
  Medium: 0.0,
  Hard: 1.0,
  'Very hard': 2.0,
};

// The number a curator's label seeds. Returns null for an unknown or empty
// label — a question with no difficulty has no honest position on the scale
// (§5.2 / CAT Slice 1 leaves difficulty_irt NULL rather than guessing 0,
// which would inject fake "Medium" evidence into the ability estimate).
export function seedIrtForLabel(label: string | null | undefined): number | null {
  if (label && label in DIFFICULTY_SEED_IRT) {
    return DIFFICULTY_SEED_IRT[label as Difficulty];
  }
  return null;
}

// ── §5.5.1 — number → display band ───────────────────────────────────
// Bucket a numeric difficulty into one of the five bands. The cut-offs fall
// at the midpoints between the five seeds (−2, −1, 0, +1, +2), i.e. at
// ±0.5 and ±1.5. Deliberately coarse: a +0.6 and a +1.4 item both read
// "Hard" — the engine tells them apart by the raw number, the band is only
// the human gloss.
export function bandForIrt(irt: number): Difficulty {
  if (irt <= -1.5) return 'Very easy';
  if (irt <= -0.5) return 'Easy';
  if (irt < 0.5) return 'Medium';
  if (irt < 1.5) return 'Hard';
  return 'Very hard';
}

// ── §5.5.2b — the difficulty a human is shown ────────────────────────
// Derived from the number, always. The shown difficulty and the used
// difficulty are therefore the same fact by construction — they cannot
// drift, which is the whole reason §5.5 exists.
//
// This used to branch on difficulty_source: show the curator's word while
// the number was still just that word translated, and only switch to the
// derived band once recalibration owned it. The branch was dropped in
// Slice 10d because it protects nothing — the §5.1 seeds round-trip
// exactly (each sits dead-centre of its own band, a full half-logit clear
// of the nearest cut-off), so for an unmeasured item both rules return the
// same word. Worse, it PERMITTED the drift: a row whose number and word
// disagreed while the source still read CURATOR_LABEL would show the word
// while the engine used the number.
//
// What the branch really defended was an item with a word and no number,
// where deriving would show nothing. That state is unreachable since the
// seeding trigger in 20260824120000 — which is what makes dropping the
// branch safe now and would not have made it safe before.
//
// difficulty_source is still needed on the CURATOR side: the editor's
// Calibrated difficulty readout must say whether a number is measured or
// assumed. It is only the student's pill that does not need the flag.
//
// Returns null when there is no number to band (the caller renders
// nothing) — an item with no difficulty has no honest position on the
// scale, and inventing "Medium" would be a lie the student can't see
// through.
export function displayBand(irt: number | null | undefined): Difficulty | null {
  return typeof irt === 'number' ? bandForIrt(irt) : null;
}
