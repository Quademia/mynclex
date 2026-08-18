// mynclex/app/login/google-actions.ts
//
// Starts the Google sign-in flow. One Server Action, and that is the whole
// client side of this feature — no browser Supabase client, no Google script,
// no JavaScript required for the button to work.
//
// ⭐ REWRITTEN 2026-08-19 (build-order item ⑤, the reversal). It used to ask
// Supabase to build the authorize URL, which meant Google redirected back to
// `<ref>.supabase.co` and said so on the consent screen. Now we build that URL
// ourselves against our OWN registered redirect URI, so the screen names our
// domain. Supabase is still the identity store — it receives the resulting ID
// token at the callback via signInWithIdToken.
//
// ⭐ WHY THIS RUNS ON THE SERVER. The three secrets of the handshake — state,
// the PKCE verifier, and where she was headed — are minted here and must
// survive a round trip through Google without ever being readable by a script.
// httpOnly cookies do that; a browser-side flow cannot.
//
// ⓘ It also sidesteps the browser-client trap in CLAUDE.md wholesale:
// createBrowserClient is a module-level singleton that consumes a `?code=`
// the instant it is constructed. Nothing here constructs one.

'use server';

import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { safeNext } from '@/lib/auth/safe-next';
import {
  GOOGLE_AUTHORIZE_URL,
  GOOGLE_HANDSHAKE_MAX_AGE_SEC,
  GOOGLE_NEXT_COOKIE,
  GOOGLE_SCOPE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  codeChallengeFor,
  googleCallbackUrl,
  googleOAuthConfig,
  randomToken,
} from '@/lib/auth/google-oauth';

export async function startGoogleSignIn(formData: FormData): Promise<void> {
  // Same open-redirect guard every other door uses. It is applied HERE, on
  // the way out, so a hostile `next` never reaches a cookie — the callback
  // re-validates on the way back too, because the round trip is long and the
  // value is attacker-reachable at both ends.
  const next = safeNext(formData.get('next'));

  // ⚠ NOT logged as GOOGLE_BLOCKED. This is our own configuration failing
  // before any address is known — nobody was refused, and writing a refusal
  // row here would put our outage in the student's timeline as though she had
  // done something.
  const config = googleOAuthConfig();
  if (!config) {
    console.error('Google sign-in is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).');
    redirect('/login?error=google_unavailable');
  }

  // Matches the precedent in lib/payments/activate.ts. Reading the origin off
  // the request rather than pinning it is what let the whole app follow
  // nclex.quademia.com on release day without a code change (2026-08-09).
  //
  // ⚠ The callback recomputes this same value from ITS request and Google
  // requires the two to match exactly. Both are the public origin the browser
  // actually used, so they agree; a mismatch surfaces immediately and loudly
  // as `redirect_uri_mismatch` rather than as anything subtle.
  const h = await headers();
  const origin = h.get('origin') ?? 'http://localhost:3000';

  const state = randomToken();
  const verifier = randomToken();
  const challenge = await codeChallengeFor(verifier);

  const jar = await cookies();
  const cookieOptions = {
    // Not readable from JavaScript. An injected script that could read the
    // verifier could complete somebody else's sign-in.
    httpOnly: true,
    // Plain http on localhost, encrypted everywhere else. Hardcoding true
    // would make these vanish in local dev, where the flow is developed.
    secure: process.env.NODE_ENV === 'production',
    // ⚠ MUST be 'lax', not 'strict'. She returns here by a cross-site
    // redirect from google.com; 'strict' withholds the cookies on exactly
    // that navigation and every sign-in would fail the state check.
    sameSite: 'lax' as const,
    path: '/',
    maxAge: GOOGLE_HANDSHAKE_MAX_AGE_SEC,
  };

  jar.set(GOOGLE_STATE_COOKIE, state, cookieOptions);
  jar.set(GOOGLE_VERIFIER_COOKIE, verifier, cookieOptions);
  // Where she was headed travels in a cookie rather than on the callback URL,
  // because that URL is matched character-for-character by Google and cannot
  // carry a varying query string. Cleared even when empty, so a `next` from an
  // abandoned earlier attempt cannot leak into this one.
  jar.set(GOOGLE_NEXT_COOKIE, next ?? '', cookieOptions);

  const authorize = new URL(GOOGLE_AUTHORIZE_URL);
  authorize.searchParams.set('client_id', config.clientId);
  authorize.searchParams.set('redirect_uri', googleCallbackUrl(origin));
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', GOOGLE_SCOPE);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 'S256');
  // Always let her choose which Google account. Without this, someone already
  // signed in to a personal Gmail is silently sent through as that identity —
  // and since we refuse addresses with no account here, the likeliest result
  // is a confusing "no account found" for a student whose account is under her
  // other address.
  authorize.searchParams.set('prompt', 'select_account');

  // ⓘ NO `nonce`, and that is a decision rather than an omission. Supabase
  // compares the SHA-256 HASH of whatever nonce you hand signInWithIdToken
  // against the token's claim (the Apple native-sign-in shape — see the type
  // docs in the installed auth-js), so passing Google's verbatim nonce back
  // would fail the comparison. The claim it guards against is ID-token
  // substitution in the implicit flow; we use the authorization-code flow with
  // a client secret and fetch the token ourselves over TLS, where state covers
  // CSRF and PKCE binds the code. There is no channel here for a substituted
  // token to arrive on.

  // ⓘ redirect() works by throwing, so it must sit outside any try/catch.
  redirect(authorize.toString());
}
