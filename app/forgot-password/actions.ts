// mynclex/app/forgot-password/actions.ts
//
// Server Action behind the forgot-password form.
//
// ⭐ IT ALWAYS SUCCEEDS, AND THAT IS THE FEATURE. Unknown address, real
// address, Supabase refusing to send — the caller gets the same answer,
// so the form cannot be used to discover who has an account here. The
// truth goes to the log instead, where support can read it and a visitor
// cannot. See lib/auth/account-lookup.ts for the full reasoning.
//
// RATE LIMITED SINCE SLICE 2c: 3 requests per address per hour, counted
// off the RESET_REQUESTED rows this action writes — which is why the log
// had to ship first.
//
// ⭐ THE LIMIT MESSAGE DOES NOT BREAK THE SILENCE ABOVE, AND THE WORDING
// IS WHY. It is allowed to exist at all because it keys off the address
// that was TYPED, never off whether that address has an account: an
// attacker learns only "this address has been submitted three times in the
// past hour", which he knows already, because he is the one who submitted
// it. ⚠ So the copy must talk about HER REQUESTS, never about our sends.
// "We've already sent a few links to this address" would be a leak — we
// send nothing at all to an address with no account, so the sentence would
// only ever be true for real ones.

'use server';

import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { logAuthEvent } from '@/lib/auth/events';
import { accountExistsForEmail } from '@/lib/auth/account-lookup';
import { checkResetThreshold, formatRetry } from '@/lib/auth/thresholds';
import {
  readTurnstileTicket,
  isCaptchaRejection,
  TURNSTILE_FIELD,
  TURNSTILE_FAILED_MESSAGE,
} from '@/lib/auth/turnstile';

type ForgotResult = { ok: true } | { ok: false; error: string };

export async function requestResetAction(formData: FormData): Promise<ForgotResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  // The one honest failure: an empty box. Nothing was attempted, so
  // nothing is logged — an empty submit must not be able to inflate the
  // slice-2c counters and lock a student out of her own reset form.
  if (!email) {
    return { ok: false, error: 'Enter the email address you registered with.' };
  }

  // ⭐ LAYER 1, ABOVE THE PER-EMAIL RULE (slice 2d). Same ordering as
  // /login and the same reason: a bot working through a list of addresses
  // never trips a per-address limit, because it only visits each one once.
  //
  // ⚠ AND THE REFUSAL IS SAFE TO SHOW HERE, which is not obvious on a form
  // whose whole design is to reveal nothing. It keys off the PASS, not the
  // address — every visitor without a valid pass gets it, whether or not
  // the address they typed exists. Nothing about the account leaks, so the
  // silence this file is built around holds.
  const turnstile = readTurnstileTicket(formData.get(TURNSTILE_FIELD));
  if (!turnstile.ok) {
    await logAuthEvent({
      eventType: 'RESET_BLOCKED',
      email,
      reason: `turnstile:${turnstile.reason}`,
    });
    return { ok: false, error: TURNSTILE_FAILED_MESSAGE };
  }

  // Before the send, and before the lookup — a refused request should cost
  // us one query, not three.
  const gate = await checkResetThreshold(email);
  if (gate.blocked) {
    await logAuthEvent({
      eventType: 'RESET_BLOCKED',
      email,
      reason: gate.rule,
    });
    return {
      ok: false,
      error: `You've asked for a reset link a few times already. Try again ${formatRetry(gate.retryAfterSeconds)}.`,
    };
  }

  // Asked BEFORE the send, because afterwards is too late to be sure: the
  // answer is recorded as it was at the moment of the request, which is
  // the only version that stays true.
  const userExists = await accountExistsForEmail(email);

  const h = await headers();
  const origin = h.get('origin') ?? 'http://localhost:3000';

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // ⚠ Must be on the Supabase project's redirect allowlist
    // (Authentication → URL Configuration) or the send is refused — that
    // is the gate that actually bites, and it is a dashboard setting, not
    // something this file can enforce.
    //
    // ⓘ This line USED to warn that item 4 (nclex.quademia.com) would
    // leave it "pointing nowhere useful in prod". Checked when item 4 was
    // built on 2026-08-09, and it was wrong: `origin` is whatever address
    // the browser actually arrived on, so the link follows the app to a
    // new domain by itself. Nothing here changed for the move. The same
    // is true of the two invite paths (lib/enrolments/actions.ts,
    // lib/payments/activate.ts) and the Paystack return URL
    // (lib/payments/actions.ts), which read the request the same way.
    redirectTo: `${origin}/reset-password`,
    // Spent here, once. See the login action for why this is the only
    // place the token is checked.
    captchaToken: turnstile.token,
  });

  // ⭐ THE ONE ERROR THIS FORM IS NOT ALLOWED TO SWALLOW. Everything below
  // deliberately returns ok:true whatever happened, so the screen cannot
  // be used to discover who has an account here. A captcha rejection is
  // the exception: no email was sent and none ever will be, so the silent
  // success screen would tell her to go and wait for a link that does not
  // exist — and she has no way to find out otherwise. It is safe to show
  // for the same reason the pre-check above is: it keys off the PASS, not
  // the address, so every visitor without a valid one sees it whether or
  // not the address they typed is real. Nothing leaks.
  if (error && isCaptchaRejection(error.message)) {
    await logAuthEvent({
      eventType: 'RESET_BLOCKED',
      email,
      reason: `turnstile:${error.message}`,
    });
    return { ok: false, error: TURNSTILE_FAILED_MESSAGE };
  }

  await logAuthEvent({
    eventType: 'RESET_REQUESTED',
    email,
    userExists,
    // The send's own outcome, not the request's. Gamma logs only that a
    // reset was ASKED for, which turns a support case into "our log says
    // we did our job, she says nothing arrived". Recording the failure
    // separates "we never sent it" from "we sent it and it went astray"
    // — two different problems with two different fixes.
    reason: error ? `send_failed: ${error.message}` : null,
  });

  // Deliberately not surfaced. A student whose email failed to send sees
  // the same screen as everyone else and reaches support none the wiser;
  // the alternative leaks whether the address was real.
  return { ok: true };
}
