// mynclex/lib/library/tutor-scope.ts
//
// The signed-in tutor's id, for scoping every tutor-side library read.
//
// ⚠ WHY THIS EXISTS — read before deleting a `.eq('tutor_id', …)`
// somewhere because "RLS already covers it".
//
// RLS does NOT mean "my rows". Postgres ORs permissive policies
// together, and `nclex_tutor_library_notes` carries three SELECT
// policies:
//
//   _self_select     tutor_id = auth.uid()            ← ownership
//   _student_select  nclex_student_can_see_note(...)  ← enrolled student
//   _admin_all       nclex_user_has_role('SUPER_ADMIN')
//
// So "what RLS lets me read" is a strictly wider set than "what I
// own". An account that is both a TUTOR and an enrolled student of
// another tutor passes rule 2 on that tutor's notes — and an
// unscoped tutor-side query renders them as the caller's own
// library. That is exactly what happened: a tutor-and-student test
// account saw all 38 of another tutor's notes, plus their folders,
// shelves, memberships and attachments (2026-08-25).
//
// The leak was read-only — UPDATE/DELETE carry only the self policy,
// so a cross-tutor write was always refused. Reads were the whole bug.
//
// ⭐ The rule: RLS is the floor, not the filter. Every tutor-side
// library read names its owner explicitly. The SQL policies stay as
// they are — a student reading that note IS allowed; the mistake was
// the tutor surface asking a question that let their answer through.
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
export const getLibraryTutorId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
});
