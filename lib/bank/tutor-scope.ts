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
import type { ServerSupabaseClient } from '@/lib/access';

type BankSurface = 'admin' | 'tutor';

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

// ── Wrapper ownership, asserted once per action ─────────────────────────
//
// The case-study and trend action files write across three tables each
// (the wrapper row, its tabs, its slot/join rows) plus the question
// rows they detach. Only the wrapper row carries `tutor_id`; the
// children hang off it. So rather than bolt a filter onto every one of
// ~20 writes — the kind of scripted, repeated edit that went wrong
// three times in one sitting on 2026-08-25 — each action proves
// ownership ONCE, at the top, before it touches anything.
//
// Everything downstream is then keyed on an id that has been proved,
// and is owner-proven by composition. That is the shape the enquiries
// surface uses and the one worth copying: gate with the authed client,
// then do the work.
//
// ⓘ `surface === 'admin'` returns true immediately, on purpose. Reaching
// every case in the shared bank IS the admin curator's job, and
// nclex_case_studies has no tutor_id to compare against. The asymmetry
// is the point: the same action file serves two surfaces that answer
// "is this mine?" differently.

/**
 * True when the caller may act on this case. Always true on the admin
 * surface; on the tutor surface, true only if they own the case.
 */
export async function assertTutorOwnsCase(
  supabase: ServerSupabaseClient,
  surface: BankSurface,
  caseId: string,
): Promise<boolean> {
  if (surface !== 'tutor') return true;
  const tutorId = await getBankTutorId();
  if (!tutorId) return false;

  const { data } = await supabase
    .from('nclex_tutor_case_studies')
    .select('case_id')
    .eq('case_id', caseId)
    .eq('tutor_id', tutorId)
    .maybeSingle();
  return data != null;
}

/**
 * True when the caller may act on this trend dataset. Always true on
 * the admin surface; on the tutor surface, true only if they own it.
 */
export async function assertTutorOwnsTrend(
  supabase: ServerSupabaseClient,
  surface: BankSurface,
  trendId: string,
): Promise<boolean> {
  if (surface !== 'tutor') return true;
  const tutorId = await getBankTutorId();
  if (!tutorId) return false;

  const { data } = await supabase
    .from('nclex_tutor_trend_datasets')
    .select('trend_id')
    .eq('trend_id', trendId)
    .eq('tutor_id', tutorId)
    .maybeSingle();
  return data != null;
}
