// mynclex/app/login/actions.ts
//
// Server Action for login. Called by the login form.

'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/auth/safe-next';
import { logAuthEvent } from '@/lib/auth/events';
import { accountExistsForEmail } from '@/lib/auth/account-lookup';
import {
  checkLoginThreshold,
  formatRetry,
  LOGIN_RULE_24H,
} from '@/lib/auth/thresholds';

type LoginResult =
  | { ok: true }
  // `suggestReset` asks the form to offer the reset link alongside the
  // message. Set only for the 24-hour block — see the gate below.
  | { ok: false; error: string; suggestReset?: boolean };

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

  // ⭐ THE GATE COMES BEFORE SUPABASE, NOT AFTER (slice 2c). An attempt
  // that is refused here never reaches signInWithPassword, so a password
  // guess against a locked address is not even tested — which is the
  // point of the rule and also why it sits above the expensive call.
  //
  // ⓘ No accountExistsForEmail on this path, unlike the failure branch
  // below. A blocked attempt is the one arriving during an attack, and
  // that is precisely when we want to do LESS work per request, not more.
  // Support loses nothing: the LOGIN_FAIL rows that caused the block are
  // sitting right underneath this row, and they carry the answer.
  const gate = await checkLoginThreshold(email);
  if (gate.blocked) {
    await logAuthEvent({
      eventType: 'LOGIN_BLOCKED',
      email,
      reason: gate.rule,
    });
    // ⭐ THE LONG BLOCK GETS A WAY OUT, THE SHORT ONE DOESN'T (Sam,
    // 2026-08-06). Ten failures in a day is a pattern a real student
    // reaches — she has genuinely forgotten the password, and the honest
    // answer to that is the reset link, not a number. "Come back
    // tomorrow" is the one reply that helps nobody: an attacker ignores
    // it and she is stranded by it, because nothing on the blocked
    // screen tells her the reset path is on a separate counter and still
    // open to her.
    //
    // The 10-minute block deliberately does NOT offer it. There, waiting
    // really is the right advice — she is probably one typo away — and
    // pushing a password reset at someone who has simply mistyped
    // creates work she didn't need.
    return {
      ok: false,
      error: `Too many sign-in attempts. Try again ${formatRetry(gate.retryAfterSeconds)}.`,
      suggestReset: gate.rule === LOGIN_RULE_24H,
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // ⭐ THE PAGE AND THE LOG HAVE DIFFERENT AUDIENCES, SO THEY GET
    // DIFFERENT ANSWERS (settled with Sam, 2026-08-06). Supabase replies
    // to a wrong password and to an unknown address with the same
    // 'Invalid login credentials', and the student must keep seeing
    // exactly that — otherwise the form becomes a way to discover who has
    // an account here. But the admin reading a support case is behind a
    // login, a role check and an RLS policy, and has no reason to inherit
    // that blindfold. So we look the address up ourselves and record
    // which of the two it actually was.
    //
    // ⚠ The result must never travel back to the caller. It is not in the
    // returned error, and it must not enter one later.
    //
    // ⓘ Cheap where it looks expensive: this sits after a failed
    // signInWithPassword, which has already run a deliberately-slow
    // password hash. One indexed lookup beside that is noise.
    const userExists = await accountExistsForEmail(email);

    await logAuthEvent({
      eventType: 'LOGIN_FAIL',
      email,
      userExists,
      // Our diagnosis first, then Supabase's own words. The verbatim
      // message still earns its place: not every failure is credentials,
      // and once email confirmation is switched on at launch, 'Email not
      // confirmed' will look identical to a wrong password from the
      // student's side while being a completely different support case.
      reason:
        userExists === null
          ? error.message
          : `${userExists ? 'wrong_password' : 'no_such_account'}: ${error.message}`,
    });
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
