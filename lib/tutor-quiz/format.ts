// mynclex/lib/tutor-quiz/format.ts
//
// Pure display + mapping helpers for the tutor-quiz surfaces. No DB,
// no React — safe to import from both server and client modules.

import type { QuizKind, QuizMode, QuizStatus } from './types';

// Which modes each quiz kind allows. Mirrors the DB CHECK
// nclex_tutor_quizzes_kind_mode_tuple — and, through it, the attempts CHECK
// nclex_attempts_intent_mode_tuple, because a quiz has no intent column:
// intent is DERIVED at launch (MOCK → EXAM, PRACTICE → STUDY). So this list
// must move whenever that one does, or a tutor could author a quiz that
// explodes on launch when the attempt INSERT hits the tightened constraint.
//
// MOCK excludes UNTIMED_LEARNING — that mode reveals answers live, wrong for
// an exam-style mock. MOCK cannot be CAT either: a CAT is its own surface,
// spends a metered allowance, and is never authored as a tutor quiz.
//
// Trimmed 2026-07-24 (migration 20260814120000) alongside the student
// builder, for the same reasons:
//   • MOCK loses UNTIMED_TEST — an untimed mock exam is the same
//     contradiction as Untimed Test under EXAM intent was. With no clock the
//     only exam-ness left is "you can't come back to it", which is an
//     arbitrary restriction rather than a simulation.
//   • PRACTICE loses TIMED_SEQUENTIAL — forward-only is an exam constraint
//     with no pedagogical purpose; blocking a student from reconsidering an
//     earlier question teaches nothing.
// Verified at the time: no existing quiz used either pairing.
export const QUIZ_MODES_BY_KIND: Record<QuizKind, QuizMode[]> = {
  PRACTICE: ['UNTIMED_LEARNING', 'UNTIMED_TEST', 'TIMED_FREE_NAV'],
  MOCK: ['TIMED_FREE_NAV', 'TIMED_SEQUENTIAL'],
};

// Timed modes carry a duration; untimed modes leave it null.
export function isTimedMode(mode: QuizMode): boolean {
  return mode === 'TIMED_FREE_NAV' || mode === 'TIMED_SEQUENTIAL';
}

export function formatQuizKind(kind: QuizKind): string {
  return kind === 'MOCK' ? 'Mock exam' : 'Practice quiz';
}

const MODE_LABELS: Record<QuizMode, string> = {
  UNTIMED_LEARNING: 'Untimed — learning',
  UNTIMED_TEST: 'Untimed — test',
  TIMED_FREE_NAV: 'Timed — free navigation',
  TIMED_SEQUENTIAL: 'Timed — sequential',
};
export function formatQuizMode(mode: QuizMode): string {
  return MODE_LABELS[mode];
}

const MODE_HELP: Record<QuizMode, string> = {
  UNTIMED_LEARNING:
    'No timer. Correctness + rationale are revealed as the student answers each question.',
  UNTIMED_TEST: 'No timer. Correctness is revealed at completion.',
  TIMED_FREE_NAV:
    'Countdown timer. The student can move freely between questions.',
  TIMED_SEQUENTIAL:
    'Countdown timer. No going back to earlier questions.',
};
export function quizModeHelp(mode: QuizMode): string {
  return MODE_HELP[mode];
}

// "DRAFT" -> "Draft", etc.
export function formatQuizStatus(status: QuizStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function quizStatusPillClass(status: QuizStatus): string {
  if (status === 'PUBLISHED') return 'is-published';
  if (status === 'ARCHIVED') return 'is-archived';
  return 'is-draft';
}

export function formatItemCount(n: number): string {
  return n === 1 ? '1 question' : `${n} questions`;
}

// duration_seconds -> "20 min" (rounded). null -> null.
export function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const mins = Math.max(1, Math.round(seconds / 60));
  return mins === 1 ? '1 min' : `${mins} min`;
}

// 0..1 fraction -> "70%". null -> null.
export function formatPassScore(passScore: number | null): string | null {
  if (passScore == null) return null;
  return `${Math.round(passScore * 100)}%`;
}

export function formatMaxAttempts(maxAttempts: number | null): string {
  if (maxAttempts == null) return 'Unlimited attempts';
  return maxAttempts === 1 ? '1 attempt' : `${maxAttempts} attempts`;
}
