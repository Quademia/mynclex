// mynclex/app/login/google-actions.ts
//
// Starts the Google sign-in flow. One Server Action, and that is the whole
// client side of this feature — no browser Supabase client, no JavaScript
// required for the button to work.
//
// ⭐ WHY THIS RUNS ON THE SERVER AND NOT IN THE BROWSER. The PKCE flow mints
// a `code_verifier` when the redirect is created, and the callback must
// present it to exchange the code. Starting the flow with the SSR client
// puts that verifier in a cookie our Route Handler can read; a plain
// <a href="…/authorize?provider=google"> would skip the mint entirely and
// the exchange would fail with nothing on screen to explain it.
//
// ⓘ It also sidesteps the browser-client trap in CLAUDE.md wholesale:
// createBrowserClient is a module-level singleton that consumes a `?code=`
// the instant it is constructed. Nothing here constructs one.

'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth/safe-next';

export async function startGoogleSignIn(formData: FormData): Promise<void> {
  // Same open-redirect guard every other door uses. It is applied HERE, on
  // the way out, so a hostile `next` never reaches Google — the callback
  // re-validates on the way back too, because the round trip is long and
  // the value is attacker-reachable at both ends.
  const next = safeNext(formData.get('next'));

  // Matches the precedent in lib/payments/activate.ts. Reading the origin
  // off the request rather than pinning it is what let the whole app follow
  // nclex.quademia.com on release day without a code change (2026-08-09).
  const h = await headers();
  const origin = h.get('origin') ?? 'http://localhost:3000';

  const callback = new URL('/auth/callback', origin);
  if (next) callback.searchParams.set('next', next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callback.toString(),
      // We do the redirecting. On the server there is no browser context for
      // the library to navigate, so without this it returns a URL and goes
      // nowhere.
      skipBrowserRedirect: true,
    },
  });

  // ⚠ NOT logged as GOOGLE_BLOCKED. This is our own configuration failing
  // (provider switched off, credentials wrong) before any address is known —
  // nobody was refused, and writing a refusal row here would put our outage
  // in the student's timeline as though she had done something.
  if (error || !data?.url) {
    console.error('Google sign-in could not start:', error?.message);
    redirect('/login?error=google_unavailable');
  }

  // ⓘ redirect() works by throwing, so it must sit outside any try/catch.
  redirect(data.url);
}
