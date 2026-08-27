// mynclex/lib/bank/tutor-scope.ts
//
// The signed-in curator's id, for scoping every TUTOR-surface bank read
// and write.
//
// ⚠ WHY THIS EXISTS — read before deleting a `.eq('tutor_id', …)` on a
// tutor bank query because "RLS already covers it".
//
// The tutor bank tables do NOT carry a student policy, so the leak that
// hit the library and the programmes (a tutor who is also somebody's
// student) does not apply here. A different one does, and it is the
// one nobody had looked for:
//
//   nclex_tutor_questions      _tutor_own[ALL]   tutor_id = auth.uid()
//                              _superadmin[ALL]  nclex_user_has_role('SUPER_ADMIN')
//
// Postgres ORs permissive policies together, so for an account holding
// SUPER_ADMIN the second policy matches EVERY row — and because it is
// FOR ALL, that includes UPDATE and DELETE. Meanwhile
// `requireBankCurator('tutor')` admits `TUTOR **or** SUPER_ADMIN` by
// design, so such an account walks onto the tutor bank legitimately and
// then sees the whole product's bank presented as its own.
//
// ⭐ WHAT THIS ACTUALLY COST (dev, 2026-08-27, measured as the real
// account under real RLS):
//
//   • /tutor/bank/all listed 118 questions to an account that owns 8.
//     110 belonged to two other tutors — full stems, options and
//     rationales — with the band cards reporting the same whole-product
//     figures (93 standalone · 25 note-born · 111 published · 7 drafts).
//   • The row actions worked. A DELETE of another tutor's published
//     question SUCCEEDED (executed, then rolled back). The identical
//     delete as a tutor who is NOT an admin affected 0 rows — so RLS
//     was doing its job for everyone except the account coming through
//     both doors at once.
//   • saveQuestion's edit path had the same hole, plus a second one: it
//     never checked the row count, so a write that matched nothing
//     returned ok: true.
//
// ⭐ The rule, same as the library and the programmes before it: RLS is
// the floor, not the filter. The difference here is that the wider set
// comes from the ADMIN policy rather than the student one — so the
// question to ask of a tutor surface is not only "could a student read
// this?" but "who else does this table let in, and is any of them
// standing on this screen?"
//
// ⚠ The SQL is correct and must NOT be "fixed". A SUPER_ADMIN reading
// every tutor's bank IS allowed — that is what /admin/* is for. The
// mistake was a screen that says "my bank" asking a question whose
// answer legally includes other people's rows, so the fix is
// app-layer.
//
// ⓘ Sibling proof that this was always the intent: /tutor/bank/cases
// and /tutor/bank/trends, in the same folder, have carried
// `.eq('tutor_id', user.id)` since they were written. Only the All
// list and the shared save/delete actions leaned on RLS.
//
// Wrapped in React's `cache()` so one RSC render shares a single
// `getUser()` round trip.

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/**
 * The signed-in user's id, or `null` when there is no session.
 *
 * Callers return their own empty shape (`null` / `[]`) rather than
 * redirecting — the auth gate belongs to the page, and a loader that
 * redirects is a loader that can't be reused by an action.
 */
export const getBankTutorId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
});
