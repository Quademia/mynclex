// mynclex/lib/tutor-quiz/format.ts
//
// Pure display + mapping helpers for the tutor-quiz surfaces. No DB,
// no React — safe to import from both server and client modules.

import type { QuizKind, QuizMode, QuizStatus } from './types';

// Which modes each quiz kind allows. Mirrors the DB CHECK
// nclex_tutor_quizzes_kind_mode_tuple: PRACTICE gets all four
// non-adaptive modes; MOCK excludes UNTIMED_LEARNING (that mode
// reveals answers live, wrong for an exam-style mock).
export const QUIZ_MODES_BY_KIND: Record<QuizKind, QuizMode[]> = {
  PRACTICE: [
    'UNTIMED_LEARNING',
    'UNTIMED_TEST',
    'TIMED_FREE_NAV',
    'TIMED_SEQUENTIAL',
  ],
  MOCK: ['UNTIMED_TEST', 'TIMED_FREE_NAV', 'TIMED_SEQUENTIAL'],
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
