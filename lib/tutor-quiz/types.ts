// mynclex/lib/tutor-quiz/types.ts
//
// Shapes for the central tutor-quiz system (Tutor Quiz Slice 1).
// Mirrors nclex_tutor_quizzes + nclex_tutor_quiz_items. A quiz is a
// reusable tutor-owned plan: metadata + an ordered list of question
// references. The student attempt snapshots the questions at
// attempt-creation time (slice 3) — the quiz itself only stores refs.

import type { QuestionType } from '@/lib/bank/classifications';

export type QuizKind = 'MOCK' | 'PRACTICE';

// The four NON-adaptive runner modes. CAT is excluded — it selects
// questions adaptively, incompatible with a quiz's fixed list.
export type QuizMode =
  | 'UNTIMED_LEARNING'
  | 'UNTIMED_TEST'
  | 'TIMED_FREE_NAV'
  | 'TIMED_SEQUENTIAL';

export type QuizStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

// Full nclex_tutor_quizzes row.
export type TutorQuiz = {
  quiz_id: string;
  tutor_id: string;
  title: string;
  description: string | null;
  quiz_kind: QuizKind;
  mode: QuizMode;
  duration_seconds: number | null;
  /** Pass threshold as a 0..1 fraction; null = ungraded. */
  pass_score: number | null;
  max_attempts: number | null;
  status: QuizStatus;
  created_at: string;
  updated_at: string;
};

// Projection for the /tutor/quizzes list — adds the question-count
// rollup (count(quiz_items)) so each card renders without a second
// round trip, plus the "Used in N programmes" count from the
// junction (Tutor Quiz Slice 5, §9.4.2) for the membership chip.
export type QuizListRow = Pick<
  TutorQuiz,
  | 'quiz_id'
  | 'title'
  | 'description'
  | 'quiz_kind'
  | 'mode'
  | 'duration_seconds'
  | 'pass_score'
  | 'max_attempts'
  | 'status'
  | 'updated_at'
> & {
  item_count: number;
  used_in_programmes: number;
};

// The editable subset — QuizFormModal's initial values in edit mode
// and the input to createQuizAction / updateQuizAction. `status` is
// only set through the edit modal (create always lands as DRAFT).
export type QuizFormValues = Pick<
  TutorQuiz,
  | 'title'
  | 'description'
  | 'quiz_kind'
  | 'mode'
  | 'duration_seconds'
  | 'pass_score'
  | 'max_attempts'
  | 'status'
>;

// One selected question inside a quiz — a quiz_item row joined to
// its question's display fields. `position` is 1-based.
export type QuizItemRow = {
  quiz_item_id: string;
  position: number;
  item_id: string;
  question_type: QuestionType;
  stem: string;
  difficulty: string | null;
  client_needs_category: string | null;
};

// One question row in the picker — the tutor's own published,
// standalone questions, filtered by the picker's filter bar.
export type PickerQuestionRow = {
  item_id: string;
  question_type: QuestionType;
  stem: string;
  difficulty: string | null;
  client_needs_category: string | null;
};

// Picker filter values — a subset of the bank filter set (no status
// or membership: the picker is hard-scoped to published + standalone).
export type QuizPickerFilters = {
  type: string;
  category: string;
  difficulty: string;
  q: string;
};

// One curriculum activity that references a quiz, used by the
// delete-preflight to BLOCK deletion of a still-linked quiz (the
// §9.3 "block, don't cascade" rule, applied quiz-wide rather than
// per-programme). Carries the programme + unit context so the
// blocked dialog can point the tutor at each placement.
export type QuizActivityLink = {
  activity_id: string;
  activity_title: string;
  programme_id: string;
  programme_title: string;
  unit_index: number;
  unit_label: 'WEEK' | 'MODULE';
  unit_title: string;
};

// A quiz option as offered to the curriculum activity editor's
// "Choose a quiz" selector (tutor-quiz Slice 2). The selector lists
// the tutor's PUBLISHED quizzes of the matching kind; `status` is
// carried so a previously-linked-but-since-archived quiz can still
// be rendered (flagged) rather than vanishing.
export type QuizPickerOption = {
  quiz_id: string;
  title: string;
  quiz_kind: QuizKind;
  mode: QuizMode;
  status: QuizStatus;
  item_count: number;
};
