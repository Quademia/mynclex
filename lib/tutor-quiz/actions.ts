// mynclex/lib/tutor-quiz/actions.ts
//
// Server actions for the tutor-quiz surfaces (Tutor Quiz Slice 1):
// quiz create / update, and the quiz-item add / remove / reorder
// operations.
//
// Auth shape mirrors lib/programmes/actions.ts — the /tutor layout
// gates the TUTOR role once per request; each action re-checks
// "signed in" and relies on RLS for ownership (tutor_id = auth.uid()
// on nclex_tutor_quizzes; ownership traces through the parent quiz
// for nclex_tutor_quiz_items).

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ServerSupabaseClient } from '@/lib/access';
import { QUIZ_MODES_BY_KIND, isTimedMode } from './format';
import type { QuizFormValues, QuizKind, QuizPickerOption } from './types';

// ── Validation ───────────────────────────────────────────────────
// Re-validated server-side at the trust boundary — the client form
// also gates, but a server action never trusts its input.

function validateQuizForm(input: QuizFormValues): string | null {
  const title = input.title?.trim() ?? '';
  if (title.length === 0) return 'Title is required.';
  if (title.length > 200) return 'Title is too long (200 characters max).';

  if (input.quiz_kind !== 'MOCK' && input.quiz_kind !== 'PRACTICE') {
    return 'Quiz kind is invalid.';
  }
  if (!QUIZ_MODES_BY_KIND[input.quiz_kind].includes(input.mode)) {
    return 'That mode is not available for this quiz kind.';
  }

  // Mode <-> duration coherence. Timed modes need a positive
  // duration; untimed modes get their duration nulled at write time
  // (see normalizeDuration), so only the "timed needs a duration"
  // direction is an error here.
  if (isTimedMode(input.mode)) {
    if (
      input.duration_seconds == null ||
      !Number.isInteger(input.duration_seconds) ||
      input.duration_seconds <= 0
    ) {
      return 'A timed mode needs a duration.';
    }
  }

  if (input.pass_score != null) {
    if (
      typeof input.pass_score !== 'number' ||
      Number.isNaN(input.pass_score) ||
      input.pass_score < 0 ||
      input.pass_score > 1
    ) {
      return 'Pass score must be between 0% and 100%.';
    }
  }

  if (input.max_attempts != null) {
    if (!Number.isInteger(input.max_attempts) || input.max_attempts < 1) {
      return 'Max attempts must be a whole number of 1 or more.';
    }
  }

  if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(input.status)) {
    return 'Status is invalid.';
  }
  return null;
}

// Untimed modes never carry a duration; null it at write time so an
// untimed quiz can't keep a stale duration after a mode switch.
function normalizeDuration(input: QuizFormValues): number | null {
  return isTimedMode(input.mode) ? input.duration_seconds : null;
}

// ── Create ───────────────────────────────────────────────────────

export type CreateQuizResult =
  | { ok: true; quiz_id: string }
  | { ok: false; error: string };

export async function createQuizAction(
  input: QuizFormValues,
): Promise<CreateQuizResult> {
  const validationError = validateQuizForm(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase
    .from('nclex_tutor_quizzes')
    .insert({
      tutor_id: user.id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      quiz_kind: input.quiz_kind,
      mode: input.mode,
      duration_seconds: normalizeDuration(input),
      pass_score: input.pass_score,
      max_attempts: input.max_attempts,
      status: input.status,
    })
    .select('quiz_id')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Failed to create quiz.' };
  }

  revalidatePath('/tutor/quizzes');
  return { ok: true, quiz_id: data.quiz_id };
}

// ── Update ───────────────────────────────────────────────────────

export type UpdateQuizResult = { ok: true } | { ok: false; error: string };

export async function updateQuizAction(
  quizId: string,
  input: QuizFormValues,
): Promise<UpdateQuizResult> {
  const validationError = validateQuizForm(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // RLS on UPDATE filters by tutor_id = auth.uid(); editing a quiz
  // that isn't yours updates 0 rows — surfaced generically so a
  // client can't probe for IDs.
  const { data, error } = await supabase
    .from('nclex_tutor_quizzes')
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      quiz_kind: input.quiz_kind,
      mode: input.mode,
      duration_seconds: normalizeDuration(input),
      pass_score: input.pass_score,
      max_attempts: input.max_attempts,
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq('quiz_id', quizId)
    .select('quiz_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: 'Quiz not found or not yours to edit.' };
  }

  revalidatePath('/tutor/quizzes');
  revalidatePath(`/tutor/quiz/${quizId}`);
  return { ok: true };
}

// ── Quiz items: add / remove / reorder ───────────────────────────

export type QuizItemActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Renumber a quiz's items to a contiguous 1..N in their current
 * `position` order. Called after a remove so positions don't gap.
 * `position` has no UNIQUE constraint (the UNIQUE is on
 * (quiz_id, item_id)), so a straight sequential UPDATE is safe.
 */
async function renumberQuizItems(
  supabase: ServerSupabaseClient,
  quizId: string,
): Promise<void> {
  const { data } = await supabase
    .from('nclex_tutor_quiz_items')
    .select('quiz_item_id, position')
    .eq('quiz_id', quizId)
    .order('position', { ascending: true });

  const rows = data ?? [];
  for (let i = 0; i < rows.length; i++) {
    const desired = i + 1;
    if (rows[i].position !== desired) {
      await supabase
        .from('nclex_tutor_quiz_items')
        .update({ position: desired })
        .eq('quiz_item_id', rows[i].quiz_item_id);
    }
  }
}

/**
 * Append the chosen questions to the quiz. Questions already in the
 * quiz are skipped (the UNIQUE (quiz_id, item_id) constraint would
 * reject them anyway). Every id is re-verified server-side as one
 * of the caller's OWN published, standalone questions — the picker
 * only shows those, but the action re-checks at the trust boundary
 * (RLS on nclex_tutor_questions does the ownership scoping).
 */
export async function addQuizItemsAction(
  quizId: string,
  itemIds: string[],
): Promise<QuizItemActionResult> {
  if (itemIds.length === 0) {
    return { ok: false, error: 'No questions selected.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Confirm the quiz is the caller's (RLS-scoped SELECT).
  const { data: quizRow } = await supabase
    .from('nclex_tutor_quizzes')
    .select('quiz_id')
    .eq('quiz_id', quizId)
    .maybeSingle();
  if (!quizRow) return { ok: false, error: 'Quiz not found or not yours.' };

  // Current items — for the next position and to skip dupes.
  const { data: existing } = await supabase
    .from('nclex_tutor_quiz_items')
    .select('item_id, position')
    .eq('quiz_id', quizId);
  const existingIds = new Set((existing ?? []).map((r) => r.item_id));
  let nextPos =
    (existing ?? []).reduce((max, r) => Math.max(max, r.position), 0) + 1;

  const toAdd = [...new Set(itemIds)].filter((id) => !existingIds.has(id));
  if (toAdd.length === 0) return { ok: true }; // all already in — no-op

  // Re-verify eligibility: each id must be one of the caller's own
  // published, standalone questions. RLS scopes the SELECT to the
  // tutor, so an id belonging to anyone else simply won't return —
  // the count mismatch then rejects the whole batch.
  const { data: validQuestions } = await supabase
    .from('nclex_tutor_questions')
    .select('item_id')
    .in('item_id', toAdd)
    .eq('is_published', true)
    .is('parent_case_id', null)
    .is('trend_id', null);
  const validIds = new Set((validQuestions ?? []).map((r) => r.item_id));
  if (validIds.size !== toAdd.length) {
    return {
      ok: false,
      error:
        'Some selected questions are not eligible — they must be your own, published, standalone questions.',
    };
  }

  const rows = toAdd.map((item_id) => ({
    quiz_id: quizId,
    item_id,
    position: nextPos++,
  }));
  const { error } = await supabase.from('nclex_tutor_quiz_items').insert(rows);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/tutor/quiz/${quizId}`);
  revalidatePath('/tutor/quizzes');
  return { ok: true };
}

/**
 * Remove one question from a quiz, then renumber the rest contiguous.
 * The quiz id comes back from the deleted row — no need to trust a
 * client-passed one. RLS on DELETE traces ownership through the
 * parent quiz.
 */
export async function removeQuizItemAction(
  quizItemId: string,
): Promise<QuizItemActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data, error } = await supabase
    .from('nclex_tutor_quiz_items')
    .delete()
    .eq('quiz_item_id', quizItemId)
    .select('quiz_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: 'Question not found or not yours.' };
  }

  await renumberQuizItems(supabase, data.quiz_id);
  revalidatePath(`/tutor/quiz/${data.quiz_id}`);
  revalidatePath('/tutor/quizzes');
  return { ok: true };
}

/**
 * Move one question up or down by one slot — a position swap with
 * its immediate neighbour. A no-op (still ok) when the item is
 * already at the edge.
 */
export async function moveQuizItemAction(
  quizItemId: string,
  direction: 'up' | 'down',
): Promise<QuizItemActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Target row (RLS-scoped through the parent quiz).
  const { data: target } = await supabase
    .from('nclex_tutor_quiz_items')
    .select('quiz_item_id, quiz_id, position')
    .eq('quiz_item_id', quizItemId)
    .maybeSingle();
  if (!target) {
    return { ok: false, error: 'Question not found or not yours.' };
  }

  // The immediate neighbour in the move direction.
  const { data: neighbour } =
    direction === 'up'
      ? await supabase
          .from('nclex_tutor_quiz_items')
          .select('quiz_item_id, position')
          .eq('quiz_id', target.quiz_id)
          .lt('position', target.position)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle()
      : await supabase
          .from('nclex_tutor_quiz_items')
          .select('quiz_item_id, position')
          .eq('quiz_id', target.quiz_id)
          .gt('position', target.position)
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle();

  if (!neighbour) return { ok: true }; // already at the edge — no-op

  // Swap the two positions.
  const swapA = await supabase
    .from('nclex_tutor_quiz_items')
    .update({ position: neighbour.position })
    .eq('quiz_item_id', target.quiz_item_id);
  if (swapA.error) return { ok: false, error: swapA.error.message };

  const swapB = await supabase
    .from('nclex_tutor_quiz_items')
    .update({ position: target.position })
    .eq('quiz_item_id', neighbour.quiz_item_id);
  if (swapB.error) return { ok: false, error: swapB.error.message };

  revalidatePath(`/tutor/quiz/${target.quiz_id}`);
  return { ok: true };
}

// ── Activity quiz picker (Slice 2) ───────────────────────────────
// Powers the curriculum activity editor's "Choose a quiz" selector.
// Returns the tutor's PUBLISHED quizzes of the matching kind (the
// dropdown options) plus the currently-linked quiz resolved by id
// — at ANY status, so a since-archived or deleted link can be
// flagged rather than silently vanishing. RLS scopes every read to
// the tutor's own quizzes.

export type ActivityQuizPickerContext =
  | {
      ok: true;
      publishedQuizzes: QuizPickerOption[];
      linkedQuiz: QuizPickerOption | null;
    }
  | { ok: false; error: string };

const QUIZ_PICKER_SELECT =
  'quiz_id, title, quiz_kind, mode, status, nclex_tutor_quiz_items(count)';

function mapQuizPickerRow(row: Record<string, unknown>): QuizPickerOption {
  const { nclex_tutor_quiz_items, ...rest } = row as typeof row & {
    nclex_tutor_quiz_items: Array<{ count: number }> | null;
  };
  return {
    ...rest,
    item_count: nclex_tutor_quiz_items?.[0]?.count ?? 0,
  } as QuizPickerOption;
}

export async function getActivityQuizPickerContext(
  quizKind: QuizKind,
  currentQuizId: string | null,
): Promise<ActivityQuizPickerContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Dropdown options: the tutor's PUBLISHED quizzes of the matching
  // kind (a Mock activity links a Mock quiz; Practice -> Practice).
  const { data: publishedData, error: publishedErr } = await supabase
    .from('nclex_tutor_quizzes')
    .select(QUIZ_PICKER_SELECT)
    .eq('quiz_kind', quizKind)
    .eq('status', 'PUBLISHED')
    .order('updated_at', { ascending: false });
  if (publishedErr) return { ok: false, error: publishedErr.message };
  const publishedQuizzes = (publishedData ?? []).map(mapQuizPickerRow);

  // Resolve the currently-linked quiz by id at any status, so the
  // selector can flag a link that now points at an archived or
  // missing quiz instead of just dropping it.
  let linkedQuiz: QuizPickerOption | null = null;
  if (currentQuizId) {
    const { data: linkedData } = await supabase
      .from('nclex_tutor_quizzes')
      .select(QUIZ_PICKER_SELECT)
      .eq('quiz_id', currentQuizId)
      .maybeSingle();
    linkedQuiz = linkedData ? mapQuizPickerRow(linkedData) : null;
  }

  return { ok: true, publishedQuizzes, linkedQuiz };
}
