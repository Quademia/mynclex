// mynclex/app/login/actions.ts
//
// Server Action for login. Called by the login form.

'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/auth/safe-next';

type LoginResult =
  | { ok: true }
  | { ok: false; error: string };

export async function loginAction(formData: FormData): Promise<LoginResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  // Optional return address (e.g. checkout sent the user here to log in).
  // Validated to a safe in-app path; anything else falls back to /router.
  const next = safeNext(formData.get('next'));

  if (!email || !password) {
    return { ok: false, error: 'Email and password are required.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  if (data.user) {
    await supabase
      .from('nclex_users')
      .update({ last_login_utc: new Date().toISOString() })
      .eq('id', data.user.id);
  }

  // Honour the validated return address if one came through; otherwise the
  // usual post-login dispatcher decides where to land (role dashboard / picker).
  redirect(next ?? '/router');
}
