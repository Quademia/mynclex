// mynclex/app/reset-password/actions.ts
//
// Server Action that finishes a password reset. Runs after the page has
// turned the emailed recovery link into a real session, so the authed
// client below sees the student whose password is being changed.
//
// ⓘ THIS IS ALSO THE "LOG EVERYONE ELSE OUT" BUTTON. Supabase terminates
// a user's other sessions on password change, which is exactly what a
// student wants the day she realises her password got around — and it
// arrives free, without the concurrent-session work that is still
// unscheduled. Worth saying in the support copy when that exists.

'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { logAuthEvent } from '@/lib/auth/events';

type ResetResult = { ok: true } | { ok: false; error: string };

export async function completeResetAction(formData: FormData): Promise<ResetResult> {
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  // Same two rules as /register and /welcome. Kept identical on purpose:
  // three places that set a password should not disagree about what a
  // valid one is.
  if (!password) {
    return { ok: false, error: 'Choose a new password.' };
  }
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  if (password !== confirmPassword) {
    return { ok: false, error: 'Passwords do not match.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The recovery session is short-lived, and a student who leaves the tab
  // open over lunch lands here. Say so plainly rather than failing with
  // whatever Supabase would have said about a missing user.
  if (!user) {
    return {
      ok: false,
      error: 'Your reset link has expired. Request a new one and try again.',
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { ok: false, error: error.message };
  }

  // ⭐ The row that closes the loop. A RESET_REQUESTED with no
  // RESET_COMPLETED after it IS the unfinished reset — that pairing is
  // what replaces gamma's used/used_utc flag, and it is why nothing in
  // this table is ever updated. Support reads "requested 14:02, never
  // completed" and says "check your spam" without needing a second table
  // or a second query.
  await logAuthEvent({
    eventType: 'RESET_COMPLETED',
    email: user.email ?? null,
    userId: user.id,
    // Not looked up: she is signed in as this account, so its existence
    // is established rather than inferred.
    userExists: true,
  });

  redirect('/router');
}
