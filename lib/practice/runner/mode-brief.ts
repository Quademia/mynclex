// mynclex/lib/practice/runner/mode-brief.ts
//
// What a mode actually DOES, in the student's words — the one place the
// runner and the preflight get their per-mode copy.
//
// Both surfaces previously carried their own, and both had gone stale in the
// same way: the preflight showed a build note ("In 4.1 every mode runs with
// per-question submit and free navigation ... land with slice 4.5") and the
// runner footer described Untimed-Learning behaviour for EVERY non-CAT mode.
// Slice 4.5 shipped long ago, so both were describing a runner that no longer
// exists — and the footer's line was actively wrong for four of the five
// modes: it promised a rationale after each submit to students in batched and
// sequential modes, who see nothing until the end.
//
// The archetype mapping lives here too, so there is exactly one definition of
// which modes behave alike. runner.tsx imports it rather than keeping a copy.

import { modeLabelFor, type Intent, type ModeId } from '@/lib/practice/builder/filter-config';

/**
 * The three behavioural groups the runner dispatches on. Five modes collapse
 * into three because navigation and submission are what actually differ:
 *
 *   UL           per-question submit, rationale immediately, free navigation
 *   FREE_BATCHED no per-question submit; answers save as drafts, everything
 *                is revealed when the attempt finalises; free navigation
 *   SEQUENTIAL   submit to advance, no going back
 *
 * CAT is SEQUENTIAL for dispatch but gets its own copy below — the engine,
 * not the student, decides what comes next and when the exam ends.
 */
export type Archetype = 'UL' | 'FREE_BATCHED' | 'SEQUENTIAL';

export function archetypeFor(mode: ModeId): Archetype {
  switch (mode) {
    case 'UNTIMED_LEARNING': return 'UL';
    case 'UNTIMED_TEST':
    case 'TIMED_FREE_NAV':   return 'FREE_BATCHED';
    case 'TIMED_SEQUENTIAL':
    case 'CAT':              return 'SEQUENTIAL';
  }
}

/**
 * The runner footer's status line. Prefixed with the mode's live label from
 * modeLabelFor(), so a rename can never leave this naming a mode that no
 * longer exists — which is exactly what happened here: the old hardcoded line
 * said "Untimed Learning", a label the product dropped on 2026-07-24.
 */
export function footerBrief(intent: Intent, mode: ModeId, isReview: boolean): string {
  if (isReview) {
    return 'Review · use the grid to filter Wrong / Flagged / Unanswered, or step in order';
  }

  const label = modeLabelFor(intent, mode);

  if (mode === 'CAT') {
    return `${label} · answer each question and submit — the exam adapts as you go and ends when it is confident`;
  }

  switch (archetypeFor(mode)) {
    case 'UL':
      return `${label} · pick an option, Submit to see the rationale, then Next →`;
    case 'FREE_BATCHED':
      return `${label} · answer in any order — your answers save as you go, and rationales arrive when you finish`;
    case 'SEQUENTIAL':
      return `${label} · submit each answer to move on — you can't return to it, and rationales arrive at the end`;
  }
}

/**
 * The preflight's "what's about to happen" note.
 *
 * Deliberately describes FEEDBACK TIMING and NAVIGATION only, plus the length
 * of the clock when there is one. It does NOT repeat the mode card's
 * "engagement-clock — pauses if you step away" claim, because that clock is
 * not built (runner.html §8 derives the countdown from started_at +
 * duration_seconds with no intent branch). Stating the minutes is true under
 * either design; promising it pauses is not, and this is the screen a student
 * reads immediately before committing to the sitting.
 */
export function preflightBrief(
  intent: Intent,
  mode: ModeId,
  durationSeconds: number | null,
): string {
  let brief: string;

  if (mode === 'CAT') {
    brief =
      'Each answer decides what comes next, so you cannot return to a question. ' +
      'The exam ends once it has enough evidence to be confident.';
  } else {
    switch (archetypeFor(mode)) {
      case 'UL':
        brief =
          'You will see the correct answer and its rationale straight after each ' +
          'question, and you can move between questions freely.';
        break;
      case 'FREE_BATCHED':
        brief =
          'You can answer in any order and change your answers until you finish. ' +
          'Rationales arrive at the end.';
        break;
      case 'SEQUENTIAL':
        brief =
          'Questions come one at a time. Once you move on you cannot return to a ' +
          'question, and rationales arrive at the end.';
        break;
    }
  }

  if (durationSeconds !== null && durationSeconds > 0) {
    brief += ` You have about ${Math.round(durationSeconds / 60)} minutes.`;
  }
  return brief;
}
