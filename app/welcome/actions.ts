// mynclex/app/welcome/actions.ts
//
// Server Action that finishes an invited student's account setup.
//
// Reached from /welcome after the student clicked their Supabase invite
// link. By the time this runs, the page has already turned the invite
// link into a real session (cookies set client-side), so the authed
// server client below sees the invited user. This action sets their
// password (invited accounts have none) and saves their name onto the
// profile row the tutor already created during off-platform add.

'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

type FinalizeResult = { ok: true } | { ok: false; error: string };

export async function finalizeWelcomeAction(
  formData: FormData,
): Promise<FinalizeResult> {
  const forename = String(formData.get('forename') ?? '').trim();
  const surname = String(formData.get('surname') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (!forename || !surname || !password) {
    return { ok: false, error: 'All fields are required.' };
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
  if (!user) {
    return {
      ok: false,
      error:
        'Your setup link has expired. Ask your tutor to add you again.',
    };
  }

  const { error: pwError } = await supabase.auth.updateUser({
    password,
    data: { full_name: `${forename} ${surname}` },
  });
  if (pwError) {
    return { ok: false, error: pwError.message };
  }

  const { error: profileError } = await supabase
    .from('nclex_users')
    .update({ forename, surname, name: `${forename} ${surname}` })
    .eq('id', user.id);
  if (profileError) {
    return { ok: false, error: 'Could not save your details. Please try again.' };
  }

  redirect('/router');
}
