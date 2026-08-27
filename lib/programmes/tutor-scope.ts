// mynclex/lib/programmes/tutor-scope.ts
//
// The signed-in tutor's id, for scoping every tutor-side programme read.
//
// ⚠ WHY THIS EXISTS — read before deleting a `.eq('tutor_id', …)`
// somewhere because "RLS already covers it".
//
// RLS does NOT mean "my rows". Postgres ORs permissive policies
// together, and `nclex_programmes` carries three SELECT policies:
//
//   _self_select     tutor_id = auth.uid()                  ← ownership
//   _student_select  nclex_has_programme_enrolment(prog_id)  ← enrolled student
//   _admin_all       nclex_user_has_role('SUPER_ADMIN')
//
// So "what RLS lets me read" is a strictly wider set than "what I
// own". An account that is both a TUTOR and an enrolled student of
// another tutor passes rule 2 on that tutor's programmes — and an
// unscoped tutor-side query renders them as the caller's own.
//
// This is the same confusion found on the library notes table on
// 2026-08-25 (see lib/library/tutor-scope.ts), one level up. Measured
// on dev 2026-08-25 before the fix:
//
//   • getMyProgrammes() carried NO ownership filter at all, so the
//     tutor programme list showed other tutors' programmes —
//     `+mynclexstudent3`, who owns zero programmes, was shown two.
//   • Those ids then fed SERVICE-ROLE reads (payments, student
//     counts) whose comments called them "owner-proven". Service role
//     bypasses RLS by design, so the list was the ONLY thing standing
//     between a tutor and another tutor's students' names, emails and
//     payment history. Three of Miss Claudia Harris's payments were
//     visible to an account that owned nothing.
//
// ⭐ The rule: RLS is the floor, not the filter. Every tutor-side
// programme read names its owner explicitly — and doubly so before
// any id crosses into a service-role client, where there is no floor
// left to fall back on.
//
// ⚠ The SQL policies are correct and must NOT be "fixed". A student
// reading a programme they are enrolled on IS allowed; that is what
// the student surfaces are for. The mistake was a tutor surface
// asking a question whose answer legally includes other people's
// rows — so the fix is app-layer, exactly as it was for the library.
//
// ⓘ SUPER_ADMIN: the explicit filter also scopes an admin walking a
// TUTOR surface to their own programmes, closing the `_admin_all`
// FOR-ALL bypass on these screens. Same call made for the library on
// 2026-08-25. Admin oversight belongs on /admin/*, not on a tutor
// screen that says "my programmes".
//
// Wrapped in React's `cache()` so the whole RSC render shares one
// `getUser()` round trip.

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/**
 * The signed-in user's id, or `null` when there is no session.
 *
 * Callers return their empty shape (`[]` / `null`) on null rather
 * than redirecting — the auth gate belongs to the layout, and a
 * query helper that redirects is a query helper that can't be
 * reused.
 */
export const getProgrammeTutorId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
});
