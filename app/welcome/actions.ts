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
import { activatePendingForEmail } from '@/lib/payments/activate';

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

  // Two arrivals land here:
  //   • tutor-add invite — the tutor already created the profile, so we
  //     just save the name.
  //   • pay-first purchase — no profile yet, so we create it + the
  //     STUDENT role (the buyer named themselves on this form).
  const fullName = `${forename} ${surname}`;
  const { data: existingProfile } = await supabase
    .from('nclex_users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (existingProfile) {
    const { error: profileError } = await supabase
      .from('nclex_users')
      .update({ forename, surname, name: fullName })
      .eq('id', user.id);
    if (profileError) {
      return { ok: false, error: 'Could not save your details. Please try again.' };
    }
  } else {
    const { error: profileError } = await supabase.from('nclex_users').insert({
      id: user.id,
      email: user.email,
      forename,
      surname,
      name: fullName,
      signup_source: 'SELF_PURCHASE',
    });
    if (profileError) {
      return { ok: false, error: 'Could not create your profile. Please try again.' };
    }
    const { error: roleError } = await supabase
      .from('nclex_user_roles')
      .insert({ user_id: user.id, role: 'STUDENT' });
    // Ignore a duplicate-role race; any other failure is non-fatal to setup.
    if (roleError && roleError.code !== '23505') {
      console.error('welcome: STUDENT role insert failed:', roleError.message);
    }
  }

  // Grant any paid-but-not-yet-activated bank purchases for this email
  // (pay-first). No-op for tutor-add arrivals. Runs server-side under the
  // service role inside the helper.
  if (user.email) {
    await activatePendingForEmail(user.email);
  }

  redirect('/router');
}
