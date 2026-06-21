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
  /** Free-text tutor taxonomy for identifying + searching quizzes.
   *  NOT NULL DEFAULT '{}' in the DB, so always an array. */
  tags: string[];
  created_at: string;
  updated_at: string;
};

// One programme a quiz is attached to (via the nclex_programme_quizzes
// junction) — id + display title. Feeds the card's Programmes badge
// peek. The count (used_in_programmes) is just this list's length.
export type QuizCardProgrammeRef = {
  programme_id: string;
  title: string;
};

// One curriculum activity that references a quiz (a MOCK / PRACTICE_QUIZ
// slot with payload.quiz_id set) — feeds the card's Activities badge
// peek. Activity title + the programme + unit it sits in.
export type QuizCardActivityRef = {
  activity_id: string;
  title: string;
  programme_title: string;
  unit_label: 'WEEK' | 'MODULE';
  unit_index: number;
  unit_title: string;
};

// Projection for the /tutor/quizzes list — adds the question-count
// rollup (count(quiz_items)) so each card renders without a second
// round trip, plus the programmes + activities a quiz is used in (the
// card's three footer badges, each with a hover-peek list — 2026-06
// Claude Design "badges row"). `used_in_programmes` is kept (=
// programmes.length) so existing readers (tutor Home) are unaffected.
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
  | 'tags'
  | 'updated_at'
> & {
  item_count: number;
  used_in_programmes: number;
  programmes: QuizCardProgrammeRef[];
  activities: QuizCardActivityRef[];
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
  | 'tags'
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
// standalone questions, filtered by the picker's filter bar. The extra
// classification fields feed the hover-peek panel (full stem + context)
// — they're not all shown on the row itself.
export type PickerQuestionRow = {
  item_id: string;
  question_type: QuestionType;
  stem: string;
  difficulty: string | null;
  client_needs_category: string | null;
  client_needs_subcategory: string | null;
  nursing_subject: string | null;
  body_system: string | null;
  topic: string | null;
  tags: string[] | null;
};

// Picker filter values now live in quiz-picker-query.ts (faceted
// multi-select + scoped search), alongside their parse/apply logic.

// One curriculum activity that references a quiz, used by the
// delete-preflight to BLOCK deletion of a still-linked quiz (the
// §9.3 "block, don't cascade" rule, applied quiz-wide rather than
// per-programme). Carries the programme + unit context so the
// blocked dialog can point the tutor at each placement.
export type QuizActivityLink = {
  activity_id: string;
  activity_title: string;
  /** The activity's slot type — must match the quiz's kind
   *  (MOCK↔MOCK, PRACTICE_QUIZ↔PRACTICE). Drives the kind-switch
   *  block. */
  activity_type: 'MOCK' | 'PRACTICE_QUIZ';
  programme_id: string;
  programme_title: string;
  unit_index: number;
  unit_label: 'WEEK' | 'MODULE';
  unit_title: string;
  // Cohort-specific activities, Slice 5 — set when the linked activity is a
  // COHORT-ONLY quiz activity (it lives on one cohort's Curriculum tab, not
  // the programme template). null/undefined = a template activity. Lets the
  // "can't delete this quiz" dialog name the cohort + link to the right
  // place. Optional so the programme-quizzes producer needs no change.
  cohort_id?: string | null;
  cohort_name?: string | null;
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
