// mynclex/app/login/actions.ts
//
// Server Action for login. Called by the login form.

'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/auth/safe-next';
import { logAuthEvent } from '@/lib/auth/events';

type LoginResult =
  | { ok: true }
  | { ok: false; error: string };

export async function loginAction(formData: FormData): Promise<LoginResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  // Optional return address (e.g. checkout sent the user here to log in).
  // Validated to a safe in-app path; anything else falls back to /router.
  const next = safeNext(formData.get('next'));

  // Not logged: nothing was attempted. This bounce never reaches Supabase,
  // so counting it would let an empty form inflate the slice-2c thresholds
  // and lock a student out by mis-submitting her own login page.
  if (!email || !password) {
    return { ok: false, error: 'Email and password are required.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Supabase answers a wrong password and an unknown address with the
    // same 'Invalid login credentials', which is what keeps the form from
    // confirming who has an account. The log inherits that blindness —
    // user_exists is a RESET-side idea, and there is nothing honest to put
    // here. Support reads the pattern instead: many fails then a success
    // is a forgotten password; many fails and no success is the case to
    // look at.
    await logAuthEvent({ eventType: 'LOGIN_FAIL', email, reason: error.message });
    return { ok: false, error: error.message };
  }

  if (data.user) {
    await supabase
      .from('nclex_users')
      .update({ last_login_utc: new Date().toISOString() })
      .eq('id', data.user.id);
  }

  // ⭐ This row is doing two jobs. The obvious one is the support
  // timeline. The other is evidence: it carries a device label, so from
  // today one account signing in as five different browsers is VISIBLE,
  // with no session limit built and no number guessed in advance. See
  // domain-and-identity.md → "Sequencing: capture first, decide with
  // evidence".
  //
  // Before the redirect on purpose — redirect() works by throwing, so
  // anything after it never runs.
  await logAuthEvent({
    eventType: 'LOGIN_OK',
    email,
    userId: data.user?.id ?? null,
  });

  // Honour the validated return address if one came through; otherwise the
  // usual post-login dispatcher decides where to land (role dashboard / picker).
  redirect(next ?? '/router');
}
