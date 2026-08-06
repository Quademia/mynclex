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
// ⚠ NO RATE LIMIT ON THIS FORM YET. The per-email rule (3 requests an
// hour) is slice 2c and enforces off the RESET_REQUESTED rows this action
// writes — which is why the log had to ship first. Until then the only
// brake is Supabase's own auth-email rate limit (100/hr, set on both
// projects). Bounded, not protected.

'use server';

import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { logAuthEvent } from '@/lib/auth/events';
import { accountExistsForEmail } from '@/lib/auth/account-lookup';

type ForgotResult = { ok: true } | { ok: false; error: string };

export async function requestResetAction(formData: FormData): Promise<ForgotResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  // The one honest failure: an empty box. Nothing was attempted, so
  // nothing is logged — an empty submit must not be able to inflate the
  // slice-2c counters and lock a student out of her own reset form.
  if (!email) {
    return { ok: false, error: 'Enter the email address you registered with.' };
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
    // (Authentication → URL Configuration) or the send is refused. And it
    // will need revisiting at build-order item 4, when the app moves to
    // nclex.quademia.com and this stops pointing anywhere useful in prod.
    redirectTo: `${origin}/reset-password`,
  });

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
