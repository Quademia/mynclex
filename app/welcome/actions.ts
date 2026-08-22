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
import { logAuthEvent } from '@/lib/auth/events';

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
      // ⚠ This used to say "Ask your tutor to add you again", which the
      // app refuses: she is already enrolled, and the duplicate-enrolment
      // guard in lib/enrolments/actions.ts blocks a second add. Corrected
      // 2026-08-12 once the code path was watched working from exactly
      // this state — the account already exists, so /login's
      // "Email me a sign-in code" gets her in without the link.
      error:
        'Your setup link has expired. Go to the sign-in page and choose ' +
        '"Email me a sign-in code" — your account already exists.',
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

  // ⭐ FINISHING SETUP IS A SIGN-IN, and nothing here ever recorded it.
  // last_login_utc was written by /login's two paths only, so anybody who
  // arrived through an invite and then stayed away read as "never signed
  // in" forever — wrong for every invited student and pay-first buyer
  // since those flows were built, not just for slice 3's tutors.
  //
  // ⓘ Which is what makes it usable as a signal: the admin directory
  // shows "Invited — not set up" on source = ADMIN_INVITE while this is
  // null, and that only means what it says because this line exists.
  const nowISO = new Date().toISOString();

  const { data: existingProfile } = await supabase
    .from('nclex_users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (existingProfile) {
    const { error: profileError } = await supabase
      .from('nclex_users')
      .update({ forename, surname, name: fullName, last_login_utc: nowISO })
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
      last_login_utc: nowISO,
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

  // Without this row an invited student simply does not exist in the log
  // until her first ordinary login — so the timeline for the arrival most
  // likely to go wrong would start after the part that went wrong.
  //
  // The reason distinguishes the two doors above, which is the first
  // question support asks: a tutor-add student who never arrives is a
  // tutor problem, a pay-first buyer who never arrives is a money
  // problem.
  await logAuthEvent({
    eventType: 'INVITE_ACCEPTED',
    email: user.email,
    userId: user.id,
    reason: existingProfile ? 'tutor_add' : 'pay_first',
  });

  redirect('/router');
}
