// mynclex/lib/tutor-quiz/queries.ts
//
// Server-side fetches for the tutor-quiz surfaces (Tutor Quiz
// Slice 1). RLS on nclex_tutor_quizzes / nclex_tutor_quiz_items
// scopes every read to the signed-in tutor's own quizzes.

import { createClient } from '@/lib/supabase/server';
import type {
  PickerQuestionRow,
  QuizItemRow,
  QuizListRow,
  QuizPickerFilters,
  TutorQuiz,
} from './types';

/**
 * /tutor/quizzes list query. One row per quiz the tutor owns, with
 * the question-count rollup folded in via a PostgREST embedded
 * count. Ordered most-recently-updated first.
 *
 * RLS scopes the SELECT to tutor_id = auth.uid() (SUPER_ADMIN
 * bypass via nclex_tutor_quizzes_superadmin). Returns [] on error.
 */
export async function getMyQuizzes(): Promise<QuizListRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_tutor_quizzes')
    .select(
      `quiz_id, title, description, quiz_kind, mode,
       duration_seconds, pass_score, max_attempts, status, updated_at,
       nclex_tutor_quiz_items(count)`,
    )
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => {
    const { nclex_tutor_quiz_items, ...rest } = row as typeof row & {
      nclex_tutor_quiz_items: Array<{ count: number }> | null;
    };
    return {
      ...rest,
      item_count: nclex_tutor_quiz_items?.[0]?.count ?? 0,
    } as QuizListRow;
  });
}

export type QuizDetail = {
  quiz: TutorQuiz;
  items: QuizItemRow[];
};

/**
 * /tutor/quiz/[id] editor query — the quiz row + its ordered list
 * of question references (joined to each question's display
 * fields). Returns null when the quiz doesn't exist OR the tutor
 * doesn't own it (RLS filters it out); the page turns null into a
 * 404. An invalid UUID in the URL also returns null.
 */
export async function getQuizDetail(
  quizId: string,
): Promise<QuizDetail | null> {
  const supabase = await createClient();

  const { data: quizData, error: quizErr } = await supabase
    .from('nclex_tutor_quizzes')
    .select('*')
    .eq('quiz_id', quizId)
    .maybeSingle();
  if (quizErr || !quizData) return null;

  // Items joined to their question's display fields. !inner so a
  // dangling reference (shouldn't happen — FK + CASCADE) drops out
  // rather than rendering a blank row.
  const { data: itemsData } = await supabase
    .from('nclex_tutor_quiz_items')
    .select(
      `quiz_item_id, position, item_id,
       nclex_tutor_questions!inner(
         question_type, stem, difficulty, client_needs_category
       )`,
    )
    .eq('quiz_id', quizId)
    .order('position', { ascending: true });

  const items: QuizItemRow[] = (itemsData ?? []).map((row) => {
    const raw = row as typeof row & {
      nclex_tutor_questions:
        | {
            question_type: string;
            stem: string;
            difficulty: string | null;
            client_needs_category: string | null;
          }
        | Array<{
            question_type: string;
            stem: string;
            difficulty: string | null;
            client_needs_category: string | null;
          }>
        | null;
    };
    const q = Array.isArray(raw.nclex_tutor_questions)
      ? raw.nclex_tutor_questions[0]
      : raw.nclex_tutor_questions;
    return {
      quiz_item_id: raw.quiz_item_id,
      position: raw.position,
      item_id: raw.item_id,
      question_type: (q?.question_type ?? 'MCQ') as QuizItemRow['question_type'],
      stem: q?.stem ?? '',
      difficulty: q?.difficulty ?? null,
      client_needs_category: q?.client_needs_category ?? null,
    };
  });

  return { quiz: quizData as TutorQuiz, items };
}

/**
 * Question-picker query — the tutor's own PUBLISHED, STANDALONE
 * questions, filtered by the picker's filter bar. Scoped this way
 * because:
 *   - Published: a quiz is built from finished questions.
 *   - Standalone (parent_case_id IS NULL AND trend_id IS NULL):
 *     case-children and trend-linked questions need the
 *     case/trend snapshot machinery, out of v1 scope.
 * RLS on nclex_tutor_questions additionally scopes to the tutor's
 * own questions. Capped at 200 rows — the filter bar narrows from
 * there.
 */
export async function getPickerQuestions(
  filters: QuizPickerFilters,
): Promise<PickerQuestionRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from('nclex_tutor_questions')
    .select('item_id, question_type, stem, difficulty, client_needs_category')
    .eq('is_published', true)
    .is('parent_case_id', null)
    .is('trend_id', null)
    .order('item_id', { ascending: true })
    .limit(200);

  if (filters.type) query = query.eq('question_type', filters.type);
  if (filters.category)
    query = query.eq('client_needs_category', filters.category);
  if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);
  if (filters.q) query = query.ilike('stem', `%${filters.q}%`);

  const { data } = await query;
  return (data ?? []) as PickerQuestionRow[];
}
