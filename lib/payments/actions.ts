// mynclex/lib/payments/actions.ts
//
// The 'use server' doorway the UI calls. Thin wrappers — the real logic
// lives in dup-check.ts / init.ts. Runs on the server (Cloudflare Worker),
// never the browser.

'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { emailHasAccount } from './dup-check';
import { startPayment } from './init';
import type { CheckoutTarget, StartPaymentResult } from './types';

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

  // Attach to the logged-in student if there is one; pay-first guests have none.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return startPayment({
    email: args.email,
    userId: user?.id ?? null,
    target: args.target,
    baseUrl,
  });
}
