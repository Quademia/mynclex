// mynclex/lib/tutor-quiz/queries.ts
//
// Server-side fetches for the tutor-quiz surfaces (Tutor Quiz
// Slice 1). RLS on nclex_tutor_quizzes / nclex_tutor_quiz_items
// scopes every read to the signed-in tutor's own quizzes.

import { createClient } from '@/lib/supabase/server';
import {
  applyQuizPickerFilters,
  type QuizPickerFilters,
} from './quiz-picker-query';
import type {
  PickerQuestionRow,
  QuizActivityLink,
  QuizItemRow,
  QuizListRow,
  TutorQuiz,
} from './types';

/**
 * /tutor/quizzes list query. One row per quiz the tutor owns, with
 * the question-count rollup AND the "Used in N programmes" count
 * folded in via PostgREST embedded counts. Ordered most-recently-
 * updated first.
 *
 * RLS scopes the SELECT to tutor_id = auth.uid() (SUPER_ADMIN
 * bypass via nclex_tutor_quizzes_superadmin). The programme-count
 * embed is added by Tutor Quiz Slice 5 — drives the "Used in N
 * programmes" chip on the card (§9.4.2).
 *
 * Returns [] on error.
 */
export async function getMyQuizzes(): Promise<QuizListRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_tutor_quizzes')
    .select(
      `quiz_id, title, description, quiz_kind, mode,
       duration_seconds, pass_score, max_attempts, status, tags, updated_at,
       nclex_tutor_quiz_items(count),
       nclex_programme_quizzes(count)`,
    )
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => {
    const {
      nclex_tutor_quiz_items,
      nclex_programme_quizzes,
      ...rest
    } = row as typeof row & {
      nclex_tutor_quiz_items: Array<{ count: number }> | null;
      nclex_programme_quizzes: Array<{ count: number }> | null;
    };
    return {
      ...rest,
      item_count: nclex_tutor_quiz_items?.[0]?.count ?? 0,
      used_in_programmes: nclex_programme_quizzes?.[0]?.count ?? 0,
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

  // Hard scope — the picker only ever offers the tutor's own published,
  // standalone questions. The faceted filters + scoped search layer on
  // top via applyQuizPickerFilters.
  let query = supabase
    .from('nclex_tutor_questions')
    .select(
      `item_id, question_type, stem, difficulty, client_needs_category,
       client_needs_subcategory, nursing_subject, body_system, topic, tags`,
    )
    .eq('is_published', true)
    .is('parent_case_id', null)
    .is('trend_id', null)
    .order('item_id', { ascending: true })
    .limit(200);

  query = applyQuizPickerFilters(query, filters);

  const { data } = await query;
  return (data ?? []) as PickerQuestionRow[];
}

/**
 * Distinct tags across the tutor's published, standalone questions —
 * the option list for the picker's Tag facet. Returns a sorted unique
 * list; [] on error. (Cap matches the picker pool.)
 */
export async function getPickerTagOptions(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('nclex_tutor_questions')
    .select('tags')
    .eq('is_published', true)
    .is('parent_case_id', null)
    .is('trend_id', null)
    .limit(500);

  const seen = new Set<string>();
  for (const row of (data ?? []) as Array<{ tags: string[] | null }>) {
    for (const t of row.tags ?? []) {
      const v = t.trim();
      if (v) seen.add(v);
    }
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

/**
 * Every curriculum activity (across ALL the tutor's programmes) that
 * still references this quiz in its payload. Drives the delete
 * preflight's BLOCK rule — a non-empty list means the quiz can't be
 * deleted until it's unlinked from those activities (§9.3 applied
 * quiz-wide). The global cousin of programme-quizzes'
 * getBlockingActivities; RLS on _activities → _units → _programmes
 * scopes the scan to the tutor's own programmes.
 *
 * The payload->>'quiz_id' filter is done in JS (the set is small) so
 * we avoid a PostgREST JSON filter chain — same approach as the
 * source-hint loader.
 */
export async function getQuizActivityLinks(
  quizId: string,
): Promise<QuizActivityLink[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('nclex_programme_activities')
    .select(
      `activity_id, title, type, payload, ordinal,
       nclex_programme_units!inner(
         unit_index, title,
         nclex_programmes!inner(programme_id, title, unit_label)
       )`,
    )
    .in('type', ['MOCK', 'PRACTICE_QUIZ']);

  if (!data) return [];

  const out: QuizActivityLink[] = [];
  for (const row of data as Array<{
    activity_id: string;
    title: string;
    type: 'MOCK' | 'PRACTICE_QUIZ';
    payload: { quiz_id?: string | null } | null;
    ordinal: number;
    nclex_programme_units:
      | {
          unit_index: number;
          title: string;
          nclex_programmes:
            | {
                programme_id: string;
                title: string;
                unit_label: 'WEEK' | 'MODULE';
              }
            | Array<{
                programme_id: string;
                title: string;
                unit_label: 'WEEK' | 'MODULE';
              }>;
        }
      | Array<{
          unit_index: number;
          title: string;
          nclex_programmes:
            | {
                programme_id: string;
                title: string;
                unit_label: 'WEEK' | 'MODULE';
              }
            | Array<{
                programme_id: string;
                title: string;
                unit_label: 'WEEK' | 'MODULE';
              }>;
        }>;
  }>) {
    if (row.payload?.quiz_id !== quizId) continue;
    const unitRow = Array.isArray(row.nclex_programme_units)
      ? row.nclex_programme_units[0]
      : row.nclex_programme_units;
    if (!unitRow) continue;
    const progRow = Array.isArray(unitRow.nclex_programmes)
      ? unitRow.nclex_programmes[0]
      : unitRow.nclex_programmes;
    if (!progRow) continue;
    out.push({
      activity_id: row.activity_id,
      activity_title: row.title,
      activity_type: row.type,
      programme_id: progRow.programme_id,
      programme_title: progRow.title,
      unit_index: unitRow.unit_index,
      unit_label: progRow.unit_label ?? 'WEEK',
      unit_title: unitRow.title,
    });
  }

  // Stable order — programme, then unit, then activity ordinal.
  out.sort(
    (a, b) =>
      a.programme_title.localeCompare(b.programme_title) ||
      a.unit_index - b.unit_index,
  );
  return out;
}

/**
 * Count of standalone student attempts directly tied to this quiz
 * (nclex_attempts.quiz_id = quizId — the Slice-6 standalone launch
 * shape). Powers the delete dialog's "results are kept" reassurance.
 *
 * Note: activity-linked attempts key off programme_activity_id, not
 * quiz_id, so they aren't counted here — but at the moment the
 * confirm dialog shows, the quiz has NO live activity links (the
 * delete is blocked otherwise), so the standalone count is the
 * accurate "attempts that point at this quiz" figure for that state.
 */
export async function getQuizAttemptCount(quizId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('nclex_attempts')
    .select('attempt_id', { count: 'exact', head: true })
    .eq('quiz_id', quizId);
  return count ?? 0;
}

/**
 * How many programmes this quiz is attached to (the §9.1 junction —
 * which already includes activity-linked programmes via auto-mirror).
 * Powers the "live in N programmes" warning shown before unpublishing
 * / archiving a quiz students can currently launch. RLS on the
 * junction scopes to the tutor's own programmes.
 */
export async function getQuizProgrammeCount(quizId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('nclex_programme_quizzes')
    .select('quiz_id', { count: 'exact', head: true })
    .eq('quiz_id', quizId);
  return count ?? 0;
}
