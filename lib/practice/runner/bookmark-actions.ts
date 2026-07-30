// Bookmark write path (docs/product-plan/flag-and-bookmark.md §3).
//
// Lives here rather than in the session route's actions.ts because it has
// TWO callers on two different routes: the runner topbar, and the session
// report's per-question table. A bookmark is (student, question) and is
// not a property of the sitting you happen to be looking at.
//
// ⚠ 'use server' modules may export ONLY async functions. Do not add a
// type or const export to this file — tsc and eslint both miss it and
// only the production build fails.

'use server';

import { createClient } from '@/lib/supabase/server';
import { bookmarkingOffered } from './bookmarks';

/**
 * Add or remove a bookmark on one question.
 *
 * Writes nclex_question_marks directly rather than through an RPC:
 * students already hold INSERT/DELETE on their own rows and the marks
 * migration settled it that way. ⚠ The FLAG is the opposite — it lives
 * on nclex_attempt_items where students hold SELECT only, so it needs a
 * SECURITY DEFINER function. Do not copy this shape there.
 *
 * Three server-side checks, none of which the client is trusted for (RLS
 * only proves the ROW would be yours, not that you should be making it):
 *
 *   1. the attempt is the caller's;
 *   2. bookmarking is offered on that attempt — the same rule the UI uses
 *      to hide the control, re-run here so a stale tab or a hand-made
 *      call cannot bookmark reserved stock;
 *   3. the question is actually IN that attempt. Without this the action
 *      reduces to "bookmark any item_id you can name", which would let a
 *      student save questions they have never been served.
 */
export async function toggleBookmarkAction(
  attemptId: string,
  itemId:    string,
  next:      boolean,
): Promise<{ ok: true; bookmarked: boolean } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: attempt, error: attemptErr } = await supabase
    .from('nclex_attempts')
    .select('attempt_id, student_id, source, mode')
    .eq('attempt_id', attemptId)
    .maybeSingle();
  if (attemptErr) return { ok: false, error: attemptErr.message };
  // One message for "not yours" and "does not exist" — a distinct
  // not-found would let a caller probe which attempt ids are real.
  if (!attempt || attempt.student_id !== user.id) {
    return { ok: false, error: 'That sitting could not be found.' };
  }

  if (!bookmarkingOffered(attempt)) {
    return { ok: false, error: 'Bookmarking is not available in this sitting.' };
  }

  const { data: row, error: itemErr } = await supabase
    .from('nclex_attempt_items')
    .select('item_id, item_source')
    .eq('attempt_id', attemptId)
    .eq('item_id', itemId)
    .limit(1)
    .maybeSingle();
  if (itemErr) return { ok: false, error: itemErr.message };
  if (!row)    return { ok: false, error: 'That question is not part of this sitting.' };

  // bookmarkingOffered already excludes PROGRAMME_ASSIGNED (the only
  // source serving TUTOR items), so this should be unreachable. It stays
  // because the marks table's CHECK requires a tutor_id for TUTOR rows,
  // and a silent constraint violation is a worse way to find out.
  if (row.item_source !== 'BANK') {
    return { ok: false, error: 'Only bank questions can be bookmarked.' };
  }

  if (next) {
    const { error } = await supabase
      .from('nclex_question_marks')
      .insert({
        student_id:    user.id,
        target_kind:   'QUESTION',
        target_source: 'BANK',
        target_id:     itemId,
      });
    // 23505 = the (student, kind, target) unique index. It means the
    // bookmark is already there, which is the state the caller asked
    // for — success, not failure. Makes the action safe to double-fire,
    // which an optimistic UI will do.
    if (error && error.code !== '23505') {
      return { ok: false, error: error.message };
    }
    return { ok: true, bookmarked: true };
  }

  const { error } = await supabase
    .from('nclex_question_marks')
    .delete()
    .eq('student_id',    user.id)
    .eq('target_kind',   'QUESTION')
    .eq('target_source', 'BANK')
    .eq('target_id',     itemId);
  if (error) return { ok: false, error: error.message };

  return { ok: true, bookmarked: false };
}
