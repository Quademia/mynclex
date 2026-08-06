// mynclex/app/register/actions.ts
//
// Server Action for student signup.
// Called by the register form. Runs on the Cloudflare Worker, not the browser.

'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createSbClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { logAuthEvent } from '@/lib/auth/events';

type RegisterResult =
  | { ok: true }
  | { ok: false; error: string };

export async function registerAction(formData: FormData): Promise<RegisterResult> {
  const forename = String(formData.get('forename') ?? '').trim();
  const surname = String(formData.get('surname') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (!forename || !surname || !email || !password) {
    return { ok: false, error: 'All fields are required.' };
  }
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  if (password !== confirmPassword) {
    return { ok: false, error: 'Passwords do not match.' };
  }

  const supabase = await createClient();

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: `${forename} ${surname}`,
      },
    },
  });

  if (signUpError) {
    return { ok: false, error: signUpError.message };
  }

  const authUser = signUpData.user;
  if (!authUser) {
    return { ok: false, error: 'Signup failed. Please try again.' };
  }

  const { error: profileError } = await supabase.from('nclex_users').insert({
    id: authUser.id,
    email,
    forename,
    surname,
    name: `${forename} ${surname}`,
    signup_source: 'MYNCLEX',
  });

  if (profileError) {
    await rollbackAuthUser(authUser.id);
    return { ok: false, error: 'Could not create profile. Please try again.' };
  }

  const { error: roleError } = await supabase.from('nclex_user_roles').insert({
    user_id: authUser.id,
    role: 'STUDENT',
  });

  if (roleError) {
    await rollbackAuthUser(authUser.id);
    return { ok: false, error: 'Could not assign role. Please try again.' };
  }

  // Only the completed signup is logged. The three failure paths above
  // all roll the auth user back, so an event there would record an
  // account that no longer exists — and REGISTERED is the only signup
  // type in the constraint precisely because a half-created user is not
  // a registration. (The rollback itself already logs to the console.)
  await logAuthEvent({
    eventType: 'REGISTERED',
    email,
    userId: authUser.id,
  });

  redirect('/router');
}

async function rollbackAuthUser(authUserId: string): Promise<void> {
  try {
    const admin = createSbClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    await admin.auth.admin.deleteUser(authUserId);
  } catch {
    console.error('Rollback deleteUser failed for', authUserId);
  }
}
