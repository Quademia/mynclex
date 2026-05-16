// mynclex/lib/student-quizzes/types.ts
//
// Shapes for the student Quizzes surface (Tutor Quiz Slice 6). One
// row per quiz in the programme's nclex_programme_quizzes junction,
// projected with the student's state + counter + the routing info
// the row needs to launch correctly (activity-linked rows route to
// the existing activity-launch RPC; standalone rows route to the
// new standalone RPC — Option 2 from the routing decision).

import type {
  QuizKind,
  QuizMode,
  QuizStatus,
} from '@/lib/tutor-quiz/types';
import type { UnitLabel } from '@/lib/programmes/types';

// Source hint shape — derived from the §9.2 LEFT JOIN to activities.
// Null means "no activity in this programme references this quiz" —
// the row is standalone-only.
export type StudentQuizSourceHint = {
  unit_index: number;
  unit_label: UnitLabel;
  unit_title: string;
};

// State pill cascade. Matches the progress-engine cascade for
// activity-linked rows; standalone rows have a smaller cascade
// (UP_NEXT doesn't apply — no curriculum order). EXHAUSTED is a
// terminal "no attempts left" — the row's button disables, the
// pill drops per §9.5 (the disabled button carries the meaning).
export type StudentQuizState =
  | 'DONE'
  | 'IN_PROGRESS'
  | 'UP_NEXT'        // activity-linked rows only
  | 'NOT_STARTED'
  | 'EXHAUSTED';

// One row on the student Quizzes page.
export type StudentQuizRow = {
  quiz_id: string;
  title: string;
  description: string | null;
  quiz_kind: QuizKind;
  mode: QuizMode;
  duration_seconds: number | null;
  pass_score: number | null;
  max_attempts: number | null;
  item_count: number;
  status: QuizStatus;

  // §9.2-derived source hint. null = standalone-only.
  source_hint: StudentQuizSourceHint | null;

  // Routing target — when source_hint is non-null, this carries
  // the primary activity_id the launch should route through
  // (Option 2 — clicking from Quizzes is equivalent to clicking
  // the linked activity in Curriculum). Null when standalone.
  primary_activity_id: string | null;

  // Student progress fields.
  state: StudentQuizState;
  attempts_taken: number;
  /** null = unlimited; otherwise max_attempts - attempts_taken. */
  attempts_remaining: number | null;
  /** Resume target when set — the runner pushes directly without
   *  a fresh RPC call. */
  in_progress_attempt_id: string | null;
};

// Filter shape. `kind` narrows by quiz_kind; `state` narrows by
// the cascade. Default = no filter applied. Filter values map to
// labels in the view component.
export type StudentQuizFilters = {
  kind: 'all' | 'MOCK' | 'PRACTICE';
  state: 'all' | 'not_started';
};

// What the row's primary action looks like — derived from state +
// remaining + in-progress. Drives the button label, the disabled
// flag, and which launch path mounts.
export type StudentQuizAction =
  | { kind: 'start';       label: 'Start' }
  | { kind: 'resume';      label: 'Resume' }
  | { kind: 'take_again';  label: 'Take again' }
  | { kind: 'exhausted';   label: 'No attempts left' };
