// mynclex/lib/programme-quizzes/actions.ts
//
// Server actions for the programme Quizzes surface (Tutor Quiz
// Slice 5).
//
// Auth + ownership: every action verifies the caller signed in,
// and relies on RLS for the rest (junction's tutor_own policy
// walks the parent programme's tutor_id; tutor_quizzes' own
// tutor_id scopes the picker).
//
// Three actions:
//   • attachQuizzesAction — bulk-upsert one or more quiz_ids into
//     the junction (idempotent via ON CONFLICT DO NOTHING).
//   • removeQuizFromProgrammeAction — block-don't-cascade remove
//     (§9.3). If the quiz still has activity links in this
//     programme, returns a `blocking_activities` error so the
//     caller can render the §9.3 rejection.
//   • createQuizAndAttachAction — creates a DRAFT quiz AND
//     attaches it to this programme; redirects the caller into
//     the existing /tutor/quiz/[id] editor (§9.4.1's "New quiz"
//     exit).

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getBlockingActivities } from './queries';
import type { BlockingActivity } from './types';

type ActionResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// =========================================================
// attachQuizzesAction
// =========================================================
// "Add existing" — multi-select picker submit. Idempotent insert
// of (programme_id, quiz_id) pairs. The picker only offers the
// tutor's own PUBLISHED quizzes not already attached; the action
// re-verifies the (caller owns the quiz, quiz is PUBLISHED) gate
// at the trust boundary so a stale client can't sneak in a draft
// or someone else's quiz.

export async function attachQuizzesAction(
  programmeId: string,
  quizIds: string[],
): Promise<ActionResult<{ attached: number }>> {
  if (quizIds.length === 0) {
    return { ok: false, error: 'No quizzes selected.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Confirm the programme is the caller's. ⚠ The tutor_id filter is
  // the check — "RLS-scoped SELECT" was written here and is false;
  // nclex_programmes is readable by enrolled students too.
  // See lib/programmes/tutor-scope.ts.
  const { data: programmeRow } = await supabase
    .from('nclex_programmes')
    .select('programme_id')
    .eq('programme_id', programmeId)
    .eq('tutor_id', user.id)
    .maybeSingle();
  if (!programmeRow) {
    return { ok: false, error: 'Programme not found or not yours.' };
  }

  // Re-verify: every quiz id is one of the caller's own PUBLISHED
  // quizzes. RLS scopes the SELECT to the tutor; an id belonging
  // to anyone else simply won't return — the count mismatch then
  // rejects the whole batch.
  const dedupedIds = [...new Set(quizIds)];
  const { data: validQuizzes } = await supabase
    .from('nclex_tutor_quizzes')
    .select('quiz_id')
    .in('quiz_id', dedupedIds)
    .eq('status', 'PUBLISHED');
  const validIds = new Set(
    (validQuizzes ?? []).map((r) => r.quiz_id),
  );
  if (validIds.size !== dedupedIds.length) {
    return {
      ok: false,
      error:
        'Some selected quizzes are not eligible — they must be your own, published quizzes.',
    };
  }

  const rows = dedupedIds.map((quiz_id) => ({
    programme_id: programmeId,
    quiz_id,
  }));
  const { error } = await supabase
    .from('nclex_programme_quizzes')
    .upsert(rows, {
      onConflict: 'programme_id,quiz_id',
      ignoreDuplicates: true,
    });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/tutor/programme/${programmeId}/quizzes`);
  revalidatePath('/tutor/quizzes');
  return { ok: true, attached: dedupedIds.length };
}

// =========================================================
// removeQuizFromProgrammeAction
// =========================================================
// Block-don't-cascade remove (§9.3). The quiz might still be the
// target of one or more activity links inside this programme. If
// so, return a `blocking_activities` error variant carrying the
// blocking rows — the caller renders the rejection UI listing
// them; the tutor unlinks from Curriculum then retries.
//
// Note: this does NOT also unlink activities. That would mask the
// curriculum-side break the tutor explicitly opted to make
// visible by removing from the Quizzes page.

export type RemoveQuizResult =
  | { ok: true }
  | { ok: false; error: string; blocking_activities?: BlockingActivity[] };

export async function removeQuizFromProgrammeAction(
  programmeId: string,
  quizId: string,
): Promise<RemoveQuizResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // §9.3 — check for activity links FIRST so the rejection
  // surfaces with the blocking rows. A non-empty blocking list
  // short-circuits the delete.
  const blocking = await getBlockingActivities(programmeId, quizId);
  if (blocking.length > 0) {
    return {
      ok: false,
      error: `This quiz is linked to ${blocking.length} ${
        blocking.length === 1 ? 'activity' : 'activities'
      } in this programme. Unlink it from those activities first.`,
      blocking_activities: blocking,
    };
  }

  // RLS on DELETE walks the parent programme's tutor_id; a row
  // that isn't the caller's gets filtered out — `.select` returns
  // null, surfaced as a generic error.
  const { data, error } = await supabase
    .from('nclex_programme_quizzes')
    .delete()
    .eq('programme_id', programmeId)
    .eq('quiz_id', quizId)
    .select('quiz_id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: 'Quiz not found in this programme or not yours.',
    };
  }

  revalidatePath(`/tutor/programme/${programmeId}/quizzes`);
  revalidatePath('/tutor/quizzes');
  return { ok: true };
}

// =========================================================
// createQuizAndAttachAction
// =========================================================
// §9.4.1 "New quiz" exit — INSERT a fresh DRAFT quiz AND the
// junction row in one logical transaction, return the new
// quiz_id so the caller can router.push() into the editor.
//
// The insert order matters: the quiz first, then the junction
// (FK depends on the quiz's quiz_id). If the junction insert
// fails after the quiz is created, the quiz stays in the tutor's
// library — that's recoverable (the tutor sees it on
// /tutor/quizzes) and the worse alternative would be silently
// losing the quiz row.

const NEW_QUIZ_DEFAULT_TITLE = 'Untitled quiz';

export async function createQuizAndAttachAction(
  programmeId: string,
): Promise<ActionResult<{ quiz_id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Confirm the programme is the caller's. ⚠ The tutor_id filter is
  // the check — "RLS-scoped SELECT" was written here and is false
  // (nclex_programmes is readable by enrolled students too), so this
  // gate meant "not readable", not "not yours".
  // Same defensive check as attach — saves a useless quiz row if
  // the caller can't actually attach.
  const { data: programmeRow } = await supabase
    .from('nclex_programmes')
    .select('programme_id')
    .eq('programme_id', programmeId)
    .eq('tutor_id', user.id)
    .maybeSingle();
  if (!programmeRow) {
    return { ok: false, error: 'Programme not found or not yours.' };
  }

  // The cheapest valid quiz: PRACTICE + UNTIMED_LEARNING. The
  // tutor lands in the editor immediately and fills in title +
  // settings — these are placeholders, not the final shape.
  // Mirrors the Slice 1 createQuizAction defaults.
  const { data: quizRow, error: quizErr } = await supabase
    .from('nclex_tutor_quizzes')
    .insert({
      tutor_id: user.id,
      title: NEW_QUIZ_DEFAULT_TITLE,
      quiz_kind: 'PRACTICE',
      mode: 'UNTIMED_LEARNING',
      status: 'DRAFT',
    })
    .select('quiz_id')
    .single();

  if (quizErr || !quizRow) {
    return {
      ok: false,
      error: quizErr?.message ?? 'Failed to create quiz.',
    };
  }

  const { error: junctionErr } = await supabase
    .from('nclex_programme_quizzes')
    .insert({
      programme_id: programmeId,
      quiz_id: quizRow.quiz_id,
    });
  if (junctionErr) {
    // The quiz row still exists (visible on /tutor/quizzes).
    // Don't try to delete it — the tutor's library is the
    // safer place to leave a half-attached quiz than a
    // silently-deleted one.
    return {
      ok: false,
      error: `Quiz created, but couldn't attach it to the programme: ${junctionErr.message}`,
    };
  }

  revalidatePath(`/tutor/programme/${programmeId}/quizzes`);
  revalidatePath('/tutor/quizzes');
  return { ok: true, quiz_id: quizRow.quiz_id };
}
