// mynclex/lib/auth/google-oauth.ts
//
// The vocabulary of the Google handshake, shared by both of its ends: the
// Server Action that sends her to Google, and the Route Handler that catches
// her coming back. Endpoints, cookie names, and the PKCE arithmetic.
//
// ⭐ WHY THIS EXISTS AS ITS OWN MODULE. `google-actions.ts` carries
// 'use server', and such a module may export ONLY async functions — an
// exported `const` there fails the production build while tsc and eslint stay
// quiet about it (see reference note: no type re-exports in 'use server').
// So anything both ends need has to live in an ordinary module, not beside
// the action that mints it.
//
// ⭐ WHY WE TALK TO GOOGLE OURSELVES rather than letting Supabase do it
// (build-order item ⑤, reversed 2026-08-18). Google's consent screen names
// the host it is about to redirect to. Point that at Supabase and the screen
// says `<ref>.supabase.co`; point it at us and it says our own domain. That
// is the entire reason for this module — Supabase still owns users, sessions
// and linking, and receives the resulting ID token via signInWithIdToken.

import 'server-only';

/** Where the student is sent to choose an account and consent. */
export const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

/** Server-to-server: where we trade the one-time code for an ID token. */
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// `openid` is what makes this an OIDC request and therefore what makes Google
// return an id_token at all — without it we would get an access token and no
// identity. `email` is the claim Supabase matches an account on; `profile`
// carries name/picture, which Supabase stores on the identity.
export const GOOGLE_SCOPE = 'openid email profile';

/**
 * Our own callback address.
 *
 * ⚠ THIS EXACT STRING IS REGISTERED IN THE GOOGLE CLOUD CONSOLE and Google
 * compares it character for character — twice: once when the student is sent
 * out, once again when the code is exchanged. A trailing slash, a stray query
 * parameter or a different host is `redirect_uri_mismatch` and the flow dies
 * at Google with nothing of ours on screen. It is also why `next` travels in
 * a cookie below instead of riding along as a query parameter, which is how
 * the Supabase-hosted flow used to carry it.
 */
export const GOOGLE_CALLBACK_PATH = '/auth/google/callback';

export function googleCallbackUrl(origin: string): string {
  return new URL(GOOGLE_CALLBACK_PATH, origin).toString();
}

// Three short-lived cookies, named for what they hold so they are recognisable
// in devtools when a student is on a support call — the convention
// PENDING_CODE_COOKIE set in code-session.ts.
//
// The state and the verifier are the two halves of "this really is the
// handshake we started": state proves the callback belongs to a flow we
// began (CSRF), the verifier proves the code being exchanged is ours (PKCE).
export const GOOGLE_STATE_COOKIE = 'mynclex-google-state';
export const GOOGLE_VERIFIER_COOKIE = 'mynclex-google-verifier';
export const GOOGLE_NEXT_COOKIE = 'mynclex-google-next';

export const GOOGLE_HANDSHAKE_COOKIES = [
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  GOOGLE_NEXT_COOKIE,
] as const;

/**
 * Ten minutes — long enough to pick an account, type a password and clear a
 * 2FA prompt on a slow phone connection; short enough that an abandoned
 * handshake does not linger. Nothing here is a session; these die at the
 * callback whatever the outcome.
 */
export const GOOGLE_HANDSHAKE_MAX_AGE_SEC = 10 * 60;

export type GoogleOAuthConfig = { clientId: string; clientSecret: string };

/**
 * The credentials, or null when either is absent.
 *
 * ⚠ BOTH OR NEITHER, deliberately — the same rule `lib/auth/turnstile.ts`
 * uses. A half-configured door is the worst of the three states: it looks
 * switched on, sends the student all the way to Google, and fails on the way
 * back where the error is hardest to read. Absent means the button reports
 * itself unavailable before she leaves the page.
 *
 * ⓘ Server-only, and no NEXT_PUBLIC_ twin — so the build-time substitution
 * trap in CLAUDE.md does not apply here. These are read at runtime, which is
 * exactly what `wrangler.jsonc` vars and Worker secrets provide.
 */
export function googleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

// base64url — the encoding OAuth uses everywhere, and NOT what btoa produces:
// the three substitutions below are the whole difference. Written by hand
// rather than reached for from Buffer because this runs on Workers, where
// Node's Buffer is not a given.
function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * A fresh unguessable value — used for both the state and the PKCE verifier.
 * 32 bytes from the platform CSPRNG; `Math.random()` would be a real hole
 * here, not a style preference.
 */
export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/**
 * The S256 challenge Google stores against the code it issues, so that only
 * the holder of the original verifier can spend it.
 *
 * ⓘ Async because Web Crypto's digest is. Available on both runtimes we
 * target (Node 18+ and Workers) without an import.
 */
export async function codeChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}
