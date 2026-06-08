// mynclex/lib/programme-quizzes/types.ts
//
// Shapes for the programme Quizzes surface (Tutor Quiz Slice 5).
// Mirrors nclex_programme_quizzes JOINed to nclex_tutor_quizzes,
// plus the derived "Linked to Unit N" / "Standalone" hint that
// comes from the LEFT JOIN to nclex_programme_activities.

import type {
  QuizKind,
  QuizMode,
  QuizStatus,
} from '@/lib/tutor-quiz/types';

// "Linked to Unit N · <unit title>" — derived at read time from
// the activity LEFT JOIN. Retained for the legacy formatter; the
// list now uses the richer `activities` array below.
export type ProgrammeQuizSourceHint = {
  unit_index: number;
  unit_label: 'WEEK' | 'MODULE';
  unit_title: string;
};

// One curriculum activity IN THIS programme that references the quiz —
// feeds the row's Activities badge + peek (2026-06 Claude Design
// "grouped rows"). A quiz can be referenced by several activities; the
// list shows them all.
export type ProgrammeQuizActivityRef = {
  activity_id: string;
  title: string;
  unit_index: number;
  unit_label: 'WEEK' | 'MODULE';
  unit_title: string;
};

// One row on the programme Quizzes list. Quiz fields are joined from
// nclex_tutor_quizzes; `item_count` is the rolled-up question count.
// The three derived context signals (2026-06 CD redesign):
//   • activities       — curriculum activities IN this programme that
//                        reference the quiz (empty = standalone)
//   • tags             — the quiz's own tags
//   • other_programmes — OTHER of the tutor's programmes the quiz is
//                        also attached to (reuse context before Remove)
export type ProgrammeQuizRow = {
  quiz_id: string;
  title: string;
  description: string | null;
  quiz_kind: QuizKind;
  mode: QuizMode;
  duration_seconds: number | null;
  pass_score: number | null;
  max_attempts: number | null;
  status: QuizStatus;
  item_count: number;
  added_at: string;
  tags: string[];
  activities: ProgrammeQuizActivityRef[];
  other_programmes: string[];
};

// One row in the "Add existing" picker — the tutor's own PUBLISHED
// quizzes NOT already attached to the programme being added to.
// Narrower than ProgrammeQuizRow (no source hint, no added_at) —
// the picker is read-only with no need for derivation.
export type PickerQuizRow = {
  quiz_id: string;
  title: string;
  quiz_kind: QuizKind;
  mode: QuizMode;
  duration_seconds: number | null;
  item_count: number;
};

// One row in the blocked-remove dialog — the activities in THIS
// programme that still reference the quiz being removed.
export type BlockingActivity = {
  activity_id: string;
  title: string;
  unit_index: number;
  unit_label: 'WEEK' | 'MODULE';
  unit_title: string;
};
