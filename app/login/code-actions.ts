// mynclex/app/login/code-actions.ts
//
// Server Actions for email-code login — build-order item 3. Slice 3c owns
// requesting a code; slice 3d adds verifying one, in this file.
//
// Separate from actions.ts on purpose: that file is the password door, this
// is the code door, and they share a page rather than a mechanism. Keeping
// them apart means the password path is not re-read and re-reasoned every
// time the code path changes.
//
// ⭐ IT ALWAYS SUCCEEDS, exactly as /forgot-password does, and for the same
// reason. Unknown address, real address, Supabase refusing to send — one
// answer, so the form cannot be used to discover who has an account here.
// The truth goes to the logbook, where support can read it and a visitor
// cannot.
//
// ⚠ THAT SILENCE IS EASIER TO BREAK HERE THAN ON /forgot-password, because
// `shouldCreateUser: false` makes Supabase answer an unknown address with a
// DISTINCT error rather than a quiet nothing. Surfacing it would turn this
// form into an account-existence oracle: type any address, learn instantly
// whether she studies here. Every error below is therefore swallowed except
// the captcha one, and the reasoning for that exception is at its branch.
//
// ⓘ Registration is not a side effect of signing in. `shouldCreateUser:
// false` is what holds that line — the default would create a bare auth
// user with no profile row and no STUDENT role, an account that exists in
// one table and nowhere else, which is the same trap first-time Google
// sign-in has waiting in slice 5.
//
// ⭐ MEASURED ON DEV, 2026-08-09, not taken on trust — accidentally, while
// checking what an unknown address returns. The two calls, same address:
//   create_user:false → 422 otp_disabled, "Signups not allowed for otp",
//                       no user created, no email sent
//   default           → 500, AND a row in auth.users, already
//                       `confirmed_at` and `last_sign_in_at`, with ZERO
//                       rows in nclex_users and ZERO in nclex_user_roles
// So the default does not merely risk a half-built account: one call made
// one, confirmed it, and signed it in, while the app it belongs to has no
// idea the person exists. The 500 came afterwards, from the email — which
// means the failure the caller sees is not even the damaging part. Test
// user deleted; dev is back to 39.

'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth/safe-next';
import { logAuthEvent } from '@/lib/auth/events';
import { accountExistsForEmail } from '@/lib/auth/account-lookup';
import {
  checkCodeRequestThreshold,
  checkCodeVerifyThreshold,
  formatRetry,
} from '@/lib/auth/thresholds';
import {
  rememberPendingCodeEmail,
  readPendingCodeEmail,
  forgetPendingCodeEmail,
} from '@/lib/auth/code-session';
import {
  readTurnstileTicket,
  isCaptchaRejection,
  TURNSTILE_FIELD,
  TURNSTILE_FAILED_MESSAGE,
} from '@/lib/auth/turnstile';

type RequestCodeResult =
  // Move to the code box. Returned for an unknown address too — see above.
  | { ok: true }
  | { ok: false; error: string };

export async function requestCodeAction(
  formData: FormData
): Promise<RequestCodeResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  // The one honest failure: an empty box. Nothing was attempted, so nothing
  // is logged — an empty submit must not be able to inflate the counters
  // and lock a student out of her own login page.
  if (!email) {
    return { ok: false, error: 'Enter the email address you registered with.' };
  }

  // ⭐ LAYER 1, ABOVE THE PER-ADDRESS RULE (slice 2d). Same ordering as
  // /login and /forgot-password, same reason: a script working through a
  // list of addresses visits each one once and trips no per-address limit
  // ever. Stopping it here means it reaches neither the counters nor
  // Supabase's shared 30-sends-an-hour budget.
  //
  // ⚠ Safe to show on a form built to reveal nothing, because it keys off
  // the PASS and not the address — every visitor without a valid one sees
  // it, whether or not what they typed exists.
  const turnstile = readTurnstileTicket(formData.get(TURNSTILE_FIELD));
  if (!turnstile.ok) {
    await logAuthEvent({
      eventType: 'CODE_BLOCKED',
      email,
      reason: `turnstile:${turnstile.reason}`,
    });
    return { ok: false, error: TURNSTILE_FAILED_MESSAGE };
  }

  // Before the send and before the lookup — a refused request should cost
  // one query, not three.
  const gate = await checkCodeRequestThreshold(email);
  if (gate.blocked) {
    await logAuthEvent({
      eventType: 'CODE_BLOCKED',
      email,
      reason: gate.rule,
    });
    // ⚠ THE COPY TALKS ABOUT HER REQUESTS, NEVER OUR SENDS — the same trap
    // /forgot-password documents. "We've already emailed you a few codes"
    // would be a leak: no email goes to an address with no account, so that
    // sentence could only ever be true of a real one. "You've asked" is
    // true either way, and tells an attacker only what he already knows,
    // because he is the one who asked.
    //
    // ⓘ The pending-code cookie is deliberately NOT cleared on this path.
    // Tripping this rule takes a fourth request in an hour, so she has
    // already been sent codes and one may still be live. Taking the code
    // box away here would punish her twice for one limit — once by refusing
    // a new code, again by hiding the box for the code she is holding.
    return {
      ok: false,
      error: `You've asked for a code a few times already. Try again ${formatRetry(gate.retryAfterSeconds)}.`,
    };
  }

  // Asked BEFORE the send, because afterwards is too late to be sure: the
  // answer is recorded as it was at the moment of the request, which is the
  // only version that stays true.
  const userExists = await accountExistsForEmail(email);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // ⭐ THE LINE THAT KEEPS SIGNING IN FROM BECOMING SIGNING UP. See the
      // header — the default silently creates a half-built account.
      shouldCreateUser: false,
      // Spent here, once, by Supabase. See lib/auth/turnstile.ts for why
      // this is the only place the pass is checked.
      captchaToken: turnstile.token,
    },
    // ⓘ No emailRedirectTo, deliberately. That option only matters to a
    // link, and the template this sends carries no link — see
    // docs/email/auth-templates.md, template 3. Passing one would be
    // harmless and misleading: the next reader would go hunting for the
    // callback route it implies, and there isn't one.
  });

  // ⭐ THE ONE ERROR THIS FORM IS NOT ALLOWED TO SWALLOW, copied from
  // /forgot-password along with its reasoning. Every other failure below
  // returns ok:true whatever happened. A captcha rejection is the exception
  // because no email was sent and none ever will be, so the silent success
  // screen would sit her in front of a code box waiting for something that
  // does not exist, with nothing on screen to say otherwise. Safe to show
  // for the same reason as the pre-check: it keys off the pass, not the
  // address.
  if (error && isCaptchaRejection(error.message)) {
    await logAuthEvent({
      eventType: 'CODE_BLOCKED',
      email,
      reason: `turnstile:${error.message}`,
    });
    return { ok: false, error: TURNSTILE_FAILED_MESSAGE };
  }

  await logAuthEvent({
    eventType: 'CODE_REQUESTED',
    email,
    userExists,
    // The send's own outcome, not the request's — the distinction
    // /forgot-password added so a support case can tell "we never sent it"
    // from "we sent it and it went astray".
    //
    // ⚠ For an unknown address this records Supabase's refusal ("Signups
    // not allowed for otp" or similar). That string is the thing that must
    // never reach the screen, and here is exactly where it belongs: the
    // admin reading a support case is behind a login, a role check and an
    // RLS policy, and has no reason to inherit the visitor's blindfold.
    reason: error ? `send_failed: ${error.message}` : null,
  });

  // ⭐⭐ WRITTEN ON EVERY PATH THAT GETS THIS FAR — real address, unknown
  // address, failed send. A cookie set only for real accounts would answer,
  // through a side channel, the exact question every line above refuses to
  // answer. The two cases have to be indistinguishable from outside, and a
  // cookie is outside.
  await rememberPendingCodeEmail(email);

  // Deliberately not conditional. A student whose email failed to send sees
  // the same screen as everyone else and reaches support none the wiser;
  // the alternative leaks whether the address was real.
  return { ok: true };
}

type VerifyCodeResult =
  // On success this never returns — redirect() throws. Present so the
  // union is honest about the shape rather than pretending.
  | { ok: true }
  // `restart` asks the form to go back to the email step. Set only when
  // there is no pending address left to verify against, where showing her
  // the code box again would be showing her a box that cannot work.
  | { ok: false; error: string; restart?: boolean };

/**
 * Slice 3d — the second half of the code door.
 *
 * ⭐ NO TURNSTILE HERE, AND IT WAS CHECKED RATHER THAN ASSUMED (2026-08-09).
 * Supabase's captcha setting does not guard the verify endpoint: a call to
 * /auth/v1/verify with no pass at all answers `otp_expired`, not
 * `captcha_failed`. So the widget would have been friction with no
 * counterpart — a second pass to clear while she squints at six digits on
 * her phone, on the door built to reduce friction. The per-address rule
 * below guards this one, on the axis that is safe for this audience.
 *
 * ⭐ AND THIS FLOW NEVER TOUCHES A URL, which settles a question the plan
 * left open. domain-and-identity.md warned that slice 3 would meet the
 * `?code=` vs `#access_token=` trap that cost /reset-password three
 * attempts. It does not: that trap is about a LINK arriving in the browser
 * with a token in it, and there is no link here. verifyOtp returns the
 * session to this server action, and the SSR client writes the session
 * cookies through `setAll` — which works because an action may set cookies.
 * Nothing is parsed out of an address bar, so there is nothing to race and
 * nothing to configure.
 */
export async function verifyCodeAction(
  formData: FormData
): Promise<VerifyCodeResult> {
  // ⭐ THE ADDRESS COMES FROM THE COOKIE, NOT THE FORM, and the reason is
  // persistence rather than security. Supabase requires the address and the
  // code to match, so a forged address buys nothing — it only asks about a
  // code that went to somebody else's inbox. What the cookie buys is that
  // she can come back from Gmail to a reloaded tab and still be mid-flow.
  const email = await readPendingCodeEmail();

  // Digits only. She may well paste "123 456" straight out of the email, or
  // out of a notification that added its own spacing, and refusing that
  // would be refusing her the correct code for having copied it faithfully.
  const code = String(formData.get('code') ?? '').replace(/\D/g, '');

  // Optional return address, same as the password door — a student sent
  // here mid-checkout goes back to where she came from.
  const next = safeNext(formData.get('next'));

  if (!email) {
    // No pending address: the cookie expired, or she arrived at this step
    // some other way. Nothing was attempted and nothing is logged — there
    // is no address to log it against, which is precisely the problem.
    return {
      ok: false,
      error: 'That took a while — enter your email address to get a new code.',
      restart: true,
    };
  }

  // Not logged, for the reason the other actions don't log an empty submit:
  // nothing was attempted, and an empty box must not be able to feed the
  // counter that locks her out.
  if (!code) {
    return { ok: false, error: 'Enter the 6-digit code from your email.' };
  }

  // ⭐ BEFORE SUPABASE, so a guess against a locked address is not even
  // tested. Same ordering, and same reasoning, as the password door.
  const gate = await checkCodeVerifyThreshold(email);
  if (gate.blocked) {
    await logAuthEvent({
      eventType: 'CODE_BLOCKED',
      email,
      reason: gate.rule,
    });
    // ⓘ No "set a new password instead" offer, unlike the 24-hour password
    // lockout. That offer exists there because ten failures in a day means
    // she has genuinely forgotten her password and reset is the honest
    // answer. Five wrong codes in ten minutes means something else — a
    // stale code, or digits misread — and the answer to both is a fresh
    // code, which the same screen already offers.
    return {
      ok: false,
      error: `Too many incorrect codes. Try again ${formatRetry(gate.retryAfterSeconds)}.`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: 'email',
  });

  if (error) {
    await logAuthEvent({
      eventType: 'CODE_LOGIN_FAIL',
      email,
      // ⓘ No accountExistsForEmail lookup here, unlike the password door.
      // It would answer nothing this row doesn't already carry: reaching
      // this action at all means a CODE_REQUESTED row exists for the same
      // address moments earlier, and that row recorded userExists at the
      // only moment it was worth recording.
      reason: error.message,
    });
    // ⚠ Supabase answers a WRONG code and an EXPIRED one identically
    // ('Token has expired or is invalid'), so this sentence cannot claim
    // to know which — and must not, since guessing wrong would send her
    // hunting for a fresh code she already has, or re-typing one that
    // died. Both fixes are on the screen; the copy names both.
    return {
      ok: false,
      error: 'That code didn’t work. Check the digits, or ask for a new one.',
    };
  }

  if (data.user) {
    await supabase
      .from('nclex_users')
      .update({ last_login_utc: new Date().toISOString() })
      .eq('id', data.user.id);
  }

  await logAuthEvent({
    eventType: 'CODE_LOGIN_OK',
    email,
    userId: data.user?.id ?? null,
  });

  // She is in; the pending address has served its purpose. Cleared before
  // the redirect because redirect() throws, so nothing after it runs — and
  // a cookie left behind would put a returning visitor back on the code
  // step holding a code that has already been spent.
  await forgetPendingCodeEmail();

  redirect(next ?? '/router');
}
