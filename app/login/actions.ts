// mynclex/app/login/actions.ts
//
// Server Action for login. Called by the login form.

'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

type LoginResult =
  | { ok: true }
  | { ok: false; error: string };

export async function loginAction(formData: FormData): Promise<LoginResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

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

  redirect('/router');
}
