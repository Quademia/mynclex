// mynclex/lib/tutor-quiz/actions.ts
//
// Server actions for the tutor-quiz surfaces (Tutor Quiz Slice 1):
// quiz create / update, and the quiz-item add / remove / reorder
// operations.
//
// Auth shape mirrors lib/programmes/actions.ts — the /tutor layout
// gates the TUTOR role once per request; each action re-checks
// "signed in" and then NAMES ITS OWNER (`.eq('tutor_id', user.id)` on
// nclex_tutor_quizzes; ownership traces through the parent quiz for
// nclex_tutor_quiz_items, which is proved by an explicit lookup).
//
// ⚠ This header used to say ownership was left to RLS. It cannot be:
// nclex_tutor_quizzes carries _superadmin FOR ALL alongside
// _tutor_own, so for an account holding SUPER_ADMIN every row matches
// — reads, updates and deletes alike. Corrected 2026-08-27; the
// reasoning lives in lib/bank/tutor-scope.ts.

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ServerSupabaseClient } from '@/lib/access';
import { QUIZ_MODES_BY_KIND, isTimedMode } from './format';
import {
  getQuizActivityLinks,
  getQuizAttemptCount,
  getQuizProgrammeCount,
} from './queries';
import type {
  QuizActivityLink,
  QuizFormValues,
  QuizKind,
  QuizPickerOption,
  QuizStatus,
} from './types';

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

// Tag hygiene at the trust boundary — the client already lowercases /
// dedupes / caps, but a server action never trusts its input. Trim,
// lowercase, drop empties, dedupe (order-preserving), clamp each to 40
// chars and the set to 16 tags. Mirrors the client TagInput limits so
// the two never disagree.
const TAG_MAX_LEN = 40;
const TAGS_MAX = 16;

function normalizeTags(tags: string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags ?? []) {
    const t = raw.trim().toLowerCase().slice(0, TAG_MAX_LEN);
    if (t.length === 0 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= TAGS_MAX) break;
  }
  return out;
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
      tags: normalizeTags(input.tags),
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

export type UpdateQuizResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** When a Kind switch is blocked: the mismatched activities the
       *  tutor must re-point / unlink first. */
      kindBlockingActivities?: QuizActivityLink[];
    };

// The quiz kind a given activity slot expects (MOCK↔MOCK,
// PRACTICE_QUIZ↔PRACTICE).
function expectedKindFor(type: 'MOCK' | 'PRACTICE_QUIZ'): QuizKind {
  return type === 'MOCK' ? 'MOCK' : 'PRACTICE';
}

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

  // Publish gate — a PUBLISHED quiz must hold at least one question.
  // A zero-question published quiz can be attached to an activity and
  // launched, snapshotting nothing into a broken/empty attempt. Mirror
  // of the bank's case/trend publish-integrity gates. Checked here (the
  // trust boundary) AND surfaced in the modal (the option is disabled).
  if (input.status === 'PUBLISHED') {
    const { count } = await supabase
      .from('nclex_tutor_quiz_items')
      .select('quiz_item_id', { count: 'exact', head: true })
      .eq('quiz_id', quizId);
    if (!count || count < 1) {
      return {
        ok: false,
        error: 'Add at least one question before publishing this quiz.',
      };
    }
  }

  // Kind-switch block. A Mock activity must link a Mock quiz (and
  // Practice↔Practice). The activity editor enforces this at link
  // time, but switching a linked quiz's Kind afterwards would leave
  // those activities pointing at a wrong-kind quiz — a "Mock exam"
  // slot silently delivering a Practice quiz. Block the switch while
  // mismatched links exist (the tutor re-points / unlinks first).
  // Only fires when the Kind actually changes.
  const { data: currentQuiz } = await supabase
    .from('nclex_tutor_quizzes')
    .select('quiz_kind')
    .eq('quiz_id', quizId)
    .eq('tutor_id', user.id)
    .maybeSingle();
  if (!currentQuiz) {
    return { ok: false, error: 'Quiz not found or not yours to edit.' };
  }
  if (input.quiz_kind !== currentQuiz.quiz_kind) {
    const links = await getQuizActivityLinks(quizId);
    const mismatched = links.filter(
      (a) => expectedKindFor(a.activity_type) !== input.quiz_kind,
    );
    if (mismatched.length > 0) {
      const n = mismatched.length;
      return {
        ok: false,
        error: `Can't change the Kind: this quiz is linked to ${n} ${
          n === 1 ? 'activity' : 'activities'
        } of the other type. Re-point or unlink ${
          n === 1 ? 'it' : 'them'
        } first.`,
        kindBlockingActivities: mismatched,
      };
    }
  }

  // ⚠ The owner filter is load-bearing. RLS does NOT narrow this for a
  // SUPER_ADMIN — nclex_tutor_quizzes_superadmin is FOR ALL and matches
  // every row, including for UPDATE. The row-count check below is right
  // and stays; its premise was the thing that was wrong. Editing a quiz
  // that isn't yours now updates 0 rows for everyone, surfaced
  // generically so a client can't probe for IDs.
  // See lib/bank/tutor-scope.ts.
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
      tags: normalizeTags(input.tags),
      updated_at: new Date().toISOString(),
    })
    .eq('quiz_id', quizId)
    .eq('tutor_id', user.id)
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

// ── Lifecycle status (publish / unpublish / archive / restore) ───
// The editor header's status buttons. A focused setter — touches only
// `status` — separate from updateQuizAction (full meta form). Going TO
// Published re-applies the ≥1-question publish gate. Leaving Published
// for an in-use quiz isn't blocked here; the UI warns first (see
// quizUsageAction) since pulling a quiz is a legitimate tutor choice.

export type SetQuizStatusResult = { ok: true } | { ok: false; error: string };

export async function setQuizStatusAction(
  quizId: string,
  status: QuizStatus,
): Promise<SetQuizStatusResult> {
  if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
    return { ok: false, error: 'Status is invalid.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  if (status === 'PUBLISHED') {
    const { count } = await supabase
      .from('nclex_tutor_quiz_items')
      .select('quiz_item_id', { count: 'exact', head: true })
      .eq('quiz_id', quizId);
    if (!count || count < 1) {
      return {
        ok: false,
        error: 'Add at least one question before publishing this quiz.',
      };
    }
  }

  // ⚠ Owner filter, same reason as updateQuiz — a SUPER_ADMIN's FOR-ALL
  // policy would otherwise let this publish or unpublish another
  // tutor's quiz. See lib/bank/tutor-scope.ts.
  const { data, error } = await supabase
    .from('nclex_tutor_quizzes')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('quiz_id', quizId)
    .eq('tutor_id', user.id)
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

// Usage snapshot for the "you're about to remove student access"
// warning. Returns the activity links + the count of programmes the
// quiz is attached to. "In use" = either is non-empty.

export type QuizUsage = {
  activityLinks: QuizActivityLink[];
  programmeCount: number;
};

export type QuizUsageResult =
  | { ok: true; usage: QuizUsage }
  | { ok: false; error: string };

export async function quizUsageAction(
  quizId: string,
): Promise<QuizUsageResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const [activityLinks, programmeCount] = await Promise.all([
    getQuizActivityLinks(quizId),
    getQuizProgrammeCount(quizId),
  ]);

  return { ok: true, usage: { activityLinks, programmeCount } };
}

// ── Delete ───────────────────────────────────────────────────────
// Two-step, "block, don't cascade" (§9.3 applied quiz-wide):
//   1. quizDeletePreflightAction — gathers what the delete dialog
//      needs: any curriculum activities still linked to the quiz
//      (a non-empty list BLOCKS the delete) + the count of student
//      attempts (for the "results are kept" reassurance line).
//   2. deleteQuizAction — re-checks the block at the trust boundary,
//      then deletes. The DB does the rest: quiz_items + standalone
//      programme memberships cascade away; student attempts survive
//      (their snapshots are inlined; only the quiz_id back-pointer
//      nulls via ON DELETE SET NULL).

export type QuizDeletePreflight =
  | {
      ok: true;
      blockingActivities: QuizActivityLink[];
      attemptCount: number;
    }
  | { ok: false; error: string };

export async function quizDeletePreflightAction(
  quizId: string,
): Promise<QuizDeletePreflight> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Confirm the quiz is the caller's. ⚠ The tutor_id filter is the
  // check — "RLS-scoped SELECT" was written here and is false, since
  // _student_select exposes PUBLISHED quizzes the caller is enrolled
  // on. See lib/programmes/tutor-scope.ts.
  const { data: quizRow } = await supabase
    .from('nclex_tutor_quizzes')
    .select('quiz_id')
    .eq('quiz_id', quizId)
    .eq('tutor_id', user.id)
    .maybeSingle();
  if (!quizRow) return { ok: false, error: 'Quiz not found or not yours.' };

  const [blockingActivities, attemptCount] = await Promise.all([
    getQuizActivityLinks(quizId),
    getQuizAttemptCount(quizId),
  ]);

  return { ok: true, blockingActivities, attemptCount };
}

export type DeleteQuizResult =
  | { ok: true }
  | { ok: false; error: string; blockingActivities?: QuizActivityLink[] };

export async function deleteQuizAction(
  quizId: string,
): Promise<DeleteQuizResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Re-check the block at the trust boundary — a stale client (or a
  // concurrent activity link added after the preflight) must not slip
  // a delete past the §9.3 rule.
  const blockingActivities = await getQuizActivityLinks(quizId);
  if (blockingActivities.length > 0) {
    const n = blockingActivities.length;
    return {
      ok: false,
      error: `This quiz is linked to ${n} ${
        n === 1 ? 'activity' : 'activities'
      }. Unlink it from those first.`,
      blockingActivities,
    };
  }

  // ⚠ Owner filter, same reason as updateQuiz — RLS alone would let a
  // SUPER_ADMIN delete another tutor's quiz through this tutor action.
  // See lib/bank/tutor-scope.ts. Deleting a quiz that isn't yours now
  // removes 0 rows for everyone — surfaced generically.
  const { data, error } = await supabase
    .from('nclex_tutor_quizzes')
    .delete()
    .eq('quiz_id', quizId)
    .eq('tutor_id', user.id)
    .select('quiz_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: 'Quiz not found or not yours to delete.' };
  }

  revalidatePath('/tutor/quizzes');
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

  // Confirm the quiz is the caller's. ⚠ The tutor_id filter is the
  // check — "RLS-scoped SELECT" was written here and is false, since
  // _student_select exposes PUBLISHED quizzes the caller is enrolled
  // on. See lib/programmes/tutor-scope.ts.
  const { data: quizRow } = await supabase
    .from('nclex_tutor_quizzes')
    .select('quiz_id')
    .eq('quiz_id', quizId)
    .eq('tutor_id', user.id)
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

  // Resolve the parent quiz (RLS-scoped through the item) so we can
  // enforce the publish gate's other half: a PUBLISHED quiz must keep
  // ≥1 question. Removing the last one would leave it published-but-
  // empty — the same broken state the publish gate blocks. Make the
  // tutor unpublish first.
  const { data: itemRow } = await supabase
    .from('nclex_tutor_quiz_items')
    .select('quiz_id, nclex_tutor_quizzes!inner(status)')
    .eq('quiz_item_id', quizItemId)
    .maybeSingle();
  if (!itemRow) {
    return { ok: false, error: 'Question not found or not yours.' };
  }
  const parent = itemRow as typeof itemRow & {
    quiz_id: string;
    nclex_tutor_quizzes:
      | { status: string }
      | Array<{ status: string }>
      | null;
  };
  const parentQuiz = Array.isArray(parent.nclex_tutor_quizzes)
    ? parent.nclex_tutor_quizzes[0]
    : parent.nclex_tutor_quizzes;

  if (parentQuiz?.status === 'PUBLISHED') {
    const { count } = await supabase
      .from('nclex_tutor_quiz_items')
      .select('quiz_item_id', { count: 'exact', head: true })
      .eq('quiz_id', parent.quiz_id);
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error:
          'This is the last question in a published quiz. Unpublish it first, then remove the question.',
      };
    }
  }

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
  //
  // ⚠ Second picker with the same hole as the programme "Add
  // existing" one — unfiltered, this offered other tutors' PUBLISHED
  // quizzes for linking to an activity. See lib/programmes/tutor-scope.ts.
  const { data: publishedData, error: publishedErr } = await supabase
    .from('nclex_tutor_quizzes')
    .select(QUIZ_PICKER_SELECT)
    .eq('tutor_id', user.id)
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
      .eq('tutor_id', user.id)
      .maybeSingle();
    linkedQuiz = linkedData ? mapQuizPickerRow(linkedData) : null;
  }

  return { ok: true, publishedQuizzes, linkedQuiz };
}
