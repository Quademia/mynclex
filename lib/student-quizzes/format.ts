// mynclex/lib/student-quizzes/format.ts
//
// Display + small derivation helpers for the student Quizzes
// surface (Tutor Quiz Slice 6). Pure — safe to import from both
// server and client modules.

import type {
  StudentQuizAction,
  StudentQuizRow,
  StudentQuizSourceHint,
  StudentQuizState,
} from './types';

// Source hint label — "Linked to Unit 3 · Pharmacology basics" or
// "Linked to Module 2 · Med-Surg deep dive". Mirrors the Slice 5
// tutor-side `formatSourceHintLabel` shape; differs only in copy
// for the standalone fallback (the row-level Standalone hint is
// rendered elsewhere with friendlier student copy).
export function formatStudentSourceHintLabel(
  hint: StudentQuizSourceHint,
): string {
  const noun = hint.unit_label === 'MODULE' ? 'Module' : 'Unit';
  return `Linked to ${noun} ${hint.unit_index} · ${hint.unit_title}`;
}

// Attempt counter — compact form for the row meta line. Distinct
// from the modal's verbose `formatAttemptsLine` in quiz-launch-viewer.tsx
// (which uses "Attempt N of M · in progress" etc.). The row line is
// short; the modal is verbose.
//
// Cases:
//   - max_attempts null, no attempts taken → "Unlimited attempts"
//   - max_attempts null, attempts taken + in-progress → "Attempt N · unlimited"
//   - max_attempts null, attempts taken + no in-progress → "N taken"
//   - capped, exhausted → "N of M used"
//   - capped, has next attempt → "Attempt N of M"
export function formatStudentAttemptCounter(q: StudentQuizRow): string {
  const taken = q.attempts_taken;
  const inProgress = q.in_progress_attempt_id != null;

  if (q.max_attempts == null) {
    if (taken === 0 && !inProgress) return 'Unlimited attempts';
    if (inProgress) return `Attempt ${taken + 1} · unlimited`;
    return `${taken} taken`;
  }

  if (q.state === 'EXHAUSTED') {
    return `${taken} of ${q.max_attempts} used`;
  }

  const n = taken + 1;
  return `Attempt ${n} of ${q.max_attempts}`;
}

// Per-state copy + CSS-class modifier for the state pill. Mirrors
// `.student-activity-state.is-done / .is-in-progress / .is-up-next
// / .is-not-started` (slice 9.3e + progress-engine slice 2). When
// hasAnyDone is true, UP_NEXT renders as "Up next"; when false, it
// renders as "Start here" (matches progress-engine slice 3's pill
// cascade).
//
// EXHAUSTED returns null — the row drops the pill and the disabled
// button carries the meaning. Same precedent as LOCKED/CLOSED rows
// on the curriculum (lib/curriculum/format.ts).
export type StatePillCopy = {
  className: string;
  label: string;
  icon: '✓' | null;
  dot: boolean;
};

export function getStudentStatePillCopy(
  state: StudentQuizState,
  hasAnyDone: boolean,
): StatePillCopy | null {
  switch (state) {
    case 'DONE':
      return {
        className: 'is-done',
        label: 'Done',
        icon: '✓',
        dot: false,
      };
    case 'IN_PROGRESS':
      return {
        className: 'is-in-progress',
        label: 'In progress',
        icon: null,
        dot: true,
      };
    case 'UP_NEXT':
      return {
        className: 'is-up-next',
        label: hasAnyDone ? 'Up next' : 'Start here',
        icon: null,
        dot: true,
      };
    case 'NOT_STARTED':
      return {
        className: 'is-not-started',
        label: 'Not started',
        icon: null,
        dot: true,
      };
    case 'EXHAUSTED':
      return null;
  }
}

// Per-row action — drives the right-side button. The cap state
// determines disabled vs enabled; the launch type (linked vs
// standalone) is decided by the row's primary_activity_id, NOT
// here (the view component decides which RPC to call).
export function getStudentRowAction(q: StudentQuizRow): StudentQuizAction {
  if (q.in_progress_attempt_id != null) {
    return { kind: 'resume', label: 'Resume' };
  }
  if (q.state === 'EXHAUSTED') {
    return { kind: 'exhausted', label: 'No attempts left' };
  }
  if (q.state === 'DONE') {
    const hasMore =
      q.max_attempts == null ||
      (q.attempts_remaining ?? 0) > 0;
    if (!hasMore) return { kind: 'exhausted', label: 'No attempts left' };
    return { kind: 'take_again', label: 'Take again' };
  }
  // NOT_STARTED / UP_NEXT
  return { kind: 'start', label: 'Start' };
}
