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
// the activity LEFT JOIN. Null when no activity in this programme
// references the quiz (standalone placement).
export type ProgrammeQuizSourceHint = {
  unit_index: number;
  unit_label: 'WEEK' | 'MODULE';
  unit_title: string;
};

// One row on the programme Quizzes list. Quiz fields are joined
// from nclex_tutor_quizzes; `item_count` is the rolled-up question
// count; `source_hint` is the activity-link derivation.
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
  source_hint: ProgrammeQuizSourceHint | null;
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
