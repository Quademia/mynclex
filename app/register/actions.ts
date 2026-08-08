// mynclex/app/register/actions.ts
//
// Server Action for student signup.
// Called by the register form. Runs on the Cloudflare Worker, not the browser.

'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createSbClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { logAuthEvent } from '@/lib/auth/events';
import {
  verifyTurnstile,
  TURNSTILE_FIELD,
  TURNSTILE_FAILED_MESSAGE,
} from '@/lib/auth/turnstile';

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

  // ⭐ THE ONLY LIMIT THIS FORM HAS (slice 2d). /login and
  // /forgot-password each sit behind a per-email rule from 2c; this one
  // does not, because 2c counts LOGIN_FAIL and RESET_REQUESTED and
  // registration writes neither. Until Turnstile arrived, /register could
  // be submitted as fast as the network allowed — which mattered more
  // here than anywhere else, since this is the one public form that
  // answers whether an address already has an account ("User already
  // registered", kept deliberately — see domain-and-identity.md → 2d).
  // That answer is worth giving to a person and worth denying to a script,
  // and this is what tells them apart.
  //
  const turnstile = await verifyTurnstile(formData.get(TURNSTILE_FIELD));
  if (!turnstile.passed) {
    await logAuthEvent({
      eventType: 'REGISTER_REJECTED',
      email,
      reason: `turnstile:${turnstile.reason}`,
    });
    return { ok: false, error: TURNSTILE_FAILED_MESSAGE };
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
    // ⭐ THE ROW THAT CLOSES THE /register GAP (slice 2d, step 2). Until
    // this line, a refused signup returned here having written nothing —
    // so /register was the only auth surface that left no trace on
    // failure, and someone walking a list of addresses to find out which
    // ones are registered here did it invisibly, in the very logbook 2a
    // built to make that visible.
    //
    // ⓘ user_exists is set from the message rather than a lookup. This is
    // the one flow where Supabase has ALREADY told us the answer, so
    // asking again would be a second query for a fact in hand. ⚠ It goes
    // in the LOG only — the student keeps seeing Supabase's own words,
    // which is Sam's decision of 2026-08-06 and the reason the message
    // is worth having at all.
    const alreadyRegistered = /already registered/i.test(signUpError.message);

    await logAuthEvent({
      eventType: 'REGISTER_REJECTED',
      email,
      userExists: alreadyRegistered ? true : null,
      reason: `signup_failed: ${signUpError.message}`,
    });
    return { ok: false, error: signUpError.message };
  }

  const authUser = signUpData.user;
  if (!authUser) {
    await logAuthEvent({
      eventType: 'REGISTER_REJECTED',
      email,
      reason: 'no_user_returned',
    });
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
    // ⭐ THE OLD REASONING FOR NOT LOGGING THIS NO LONGER HOLDS, so it is
    // logged now. It used to run: the rollback deletes the auth user, so
    // an event here would describe an account that does not exist, and
    // REGISTERED was the only signup type available to describe it with.
    // The second half is what changed — REGISTER_REJECTED says exactly
    // "this signup did not happen", which is the true statement about a
    // rolled-back attempt.
    //
    // And it is the case support most needs: a student who says she
    // registered and cannot sign in. Until now that existed only as a
    // console line on a Worker, which nobody will ever go and read.
    //
    // ⓘ No userId — deliberately. The id is gone by this point, and a
    // foreign key to a deleted auth user is worse than no id at all.
    await logAuthEvent({
      eventType: 'REGISTER_REJECTED',
      email,
      reason: `profile_insert_failed: ${profileError.message}`,
    });
    return { ok: false, error: 'Could not create profile. Please try again.' };
  }

  const { error: roleError } = await supabase.from('nclex_user_roles').insert({
    user_id: authUser.id,
    role: 'STUDENT',
  });

  if (roleError) {
    await rollbackAuthUser(authUser.id);
    await logAuthEvent({
      eventType: 'REGISTER_REJECTED',
      email,
      reason: `role_insert_failed: ${roleError.message}`,
    });
    return { ok: false, error: 'Could not assign role. Please try again.' };
  }

  // REGISTERED here; REGISTER_REJECTED on all five failure paths that got
  // as far as Supabase. /register was the only auth surface that could be
  // left silently, and that is what slice 2d step 2 came to fix.
  //
  // ⓘ The three validation bounces at the top of this function stay
  // unlogged, matching the empty-form bounce in the login action: nothing
  // was attempted, so there is nothing to record, and logging them would
  // fill the table with mistyped confirm-password fields.
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
