// mynclex/lib/payments/actions.ts
//
// The 'use server' doorway the UI calls. Thin wrappers — the real logic
// lives in dup-check.ts / init.ts. Runs on the server (Cloudflare Worker),
// never the browser.

'use server';

import { headers } from 'next/headers';
import { emailHasAccount } from './dup-check';
import { startPayment } from './init';
import { startTrial } from './trial';
import type { CheckoutTarget, StartPaymentResult } from './types';
import type { StartTrialResult } from './trial';

// Email dup-check — called as the buyer enters their email, before
// they're sent to Paystack. exists=true → checkout should pause and ask
// them to log in.
export async function checkEmail(email: string): Promise<{ exists: boolean }> {
  return { exists: await emailHasAccount(email) };
}

// Start a payment and hand back the Paystack redirect link. The caller
// navigates the browser to authorizationUrl.
export async function startPaymentAction(args: {
  email: string;
  target: CheckoutTarget;
}): Promise<StartPaymentResult> {
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const baseUrl = `${proto}://${host}`;

  // The payment's EMAIL is the canonical identity. The dup-check has
  // already reconciled an existing email to its account (via login before
  // payment), and activation resolves the account by this email — so we
  // deliberately do NOT stamp the current session's id here. (In 5.4's
  // real checkout a logged-in buyer's email field is pre-filled with their
  // own account email, so it still resolves to them.)
  return startPayment({
    email: args.email,
    target: args.target,
    baseUrl,
  });
}

// Start the free 7-day bank trial. No Paystack round trip and so no
// redirect to hand back — the result says what happened and the page
// speaks. A signed-in caller's own email overrides the argument (see
// startTrial).
export async function startTrialAction(email: string): Promise<StartTrialResult> {
  return startTrial(email);
}
