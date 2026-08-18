// mynclex/app/auth/google/callback/route.ts
//
// Where Google sends her back. Not a page; nobody looks at it. The browser
// lands here for a moment, work happens, and it redirects on.
//
// ⭐ THIS ADDRESS IS REGISTERED IN THE GOOGLE CLOUD CONSOLE, which is the
// whole point of build-order item ⑤: Google's consent screen names the host it
// redirects to, so owning the redirect is what replaced `<ref>.supabase.co`
// with our own domain. Renaming this route means editing the Cloud Console for
// every environment, and a mismatch is `redirect_uri_mismatch` at Google with
// nothing of ours on screen to explain it.
//
// ⭐ WHAT CHANGED ABOUT THE REFUSAL, AND IT IS THE SUBTLE PART OF THE SWAP.
// The stranger-refusal hook (20260907120000_google_signin.sql) still fires —
// it is a before-user-created hook, consulted for EVERY user creation, so it
// is unaffected by which door the creation arrives at. But it no longer
// reaches us as an `?error=` on this URL, because Supabase is no longer the
// one redirecting: it now comes back as a FAILED signInWithIdToken call, in
// this process. Same refusal, same GOOGLE_BLOCKED row, different messenger.
//
// ⭐ THE `?code=` TRAP IN CLAUDE.md DOES NOT APPLY HERE, and this must not be
// "fixed" to look like /welcome. That trap is about createBrowserClient
// consuming the code in the BROWSER before the caller can. This code is
// Google's, not Supabase's, and is exchanged server-to-server; no browser
// client is ever constructed on this path.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logAuthEvent } from '@/lib/auth/events';
import { safeNext } from '@/lib/auth/safe-next';
import {
  GOOGLE_HANDSHAKE_COOKIES,
  GOOGLE_NEXT_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_TOKEN_URL,
  GOOGLE_VERIFIER_COOKIE,
  googleCallbackUrl,
  googleOAuthConfig,
} from '@/lib/auth/google-oauth';

export const dynamic = 'force-dynamic';

// The hook's own words, from the migration. Matched loosely (case-insensitive,
// substring) because it travels through an error envelope on the way here, and
// an exact-match test would quietly reclassify a real refusal as an unknown
// error the day either end reformats it.
//
// ⚠ If the message in the migration changes, change it here too. They are two
// statements of one fact and nothing keeps them in step.
const HOOK_REFUSAL = /no account found for this google address/i;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const oauthError = params.get('error');
  const returnedState = params.get('state');

  // Read before anything can redirect — the response builder below burns them.
  const expectedState = request.cookies.get(GOOGLE_STATE_COOKIE)?.value ?? null;
  const verifier = request.cookies.get(GOOGLE_VERIFIER_COOKIE)?.value ?? null;
  // Re-validated on the way back, not merely trusted because we set it on the
  // way out. It has been sitting in a cookie across two external redirects.
  const next = safeNext(request.cookies.get(GOOGLE_NEXT_COOKIE)?.value ?? null);

  // Every exit from this handler burns the handshake cookies — success,
  // refusal, or crash. They are single-use by definition: leaving a spent
  // verifier in the jar is the one way a replayed callback could ever be
  // worth attempting.
  const redirectTo = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.nextUrl.origin), {
      status: 303,
    });
    for (const name of GOOGLE_HANDSHAKE_COOKIES) response.cookies.delete(name);
    return response;
  };

  // ── Google itself turned her away, or she declined ─────────────────────
  // Consent denied, an unregistered redirect URI, a disabled client. None of
  // these is our hook, and none carries an address — Google does not tell us
  // who declined.
  if (oauthError || !code) {
    await logAuthEvent({
      eventType: 'GOOGLE_BLOCKED',
      email: null,
      reason: `oauth_error:${oauthError ?? 'no_code'}`,
    });
    return redirectTo('/login?error=google_failed');
  }

  // ── This callback must belong to a handshake we started ────────────────
  // A missing cookie is the ordinary version of this (she took longer than the
  // ten minutes, or arrived at this URL out of nowhere); a present-but-
  // different one is the case the parameter exists for.
  if (!expectedState || !verifier || returnedState !== expectedState) {
    console.error('Google callback state check failed.');
    await logAuthEvent({
      eventType: 'GOOGLE_BLOCKED',
      email: null,
      reason: 'state_mismatch',
    });
    return redirectTo('/login?error=google_failed');
  }

  const config = googleOAuthConfig();
  if (!config) {
    console.error('Google callback reached with no credentials configured.');
    return redirectTo('/login?error=google_unavailable');
  }

  // ── Trade the one-time code for an identity ────────────────────────────
  // Server to server, over TLS, carrying the client secret and the verifier.
  // This is the exchange Supabase used to perform on its own domain.
  let idToken: string | undefined;
  let accessToken: string | undefined;
  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        // ⚠ Must be identical to the value sent when the flow started —
        // Google checks it a second time here. Both are built from the public
        // origin of the request that carried them, so they agree.
        redirect_uri: googleCallbackUrl(request.nextUrl.origin),
      }),
    });

    const payload = (await tokenResponse.json()) as {
      id_token?: string;
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok || !payload.id_token) {
      // Logged with Google's own words: `redirect_uri_mismatch` and
      // `invalid_client` are configuration faults that would otherwise look
      // identical to a student giving up, and they are the two most likely
      // failures the first time this runs in a new environment.
      console.error(
        'Google token exchange failed:',
        payload.error ?? tokenResponse.status,
        payload.error_description ?? ''
      );
      await logAuthEvent({
        eventType: 'GOOGLE_BLOCKED',
        email: null,
        reason: `exchange_failed:${payload.error ?? tokenResponse.status}`,
      });
      return redirectTo('/login?error=google_failed');
    }

    idToken = payload.id_token;
    accessToken = payload.access_token;
  } catch (err) {
    console.error('Google token exchange could not be reached:', err);
    await logAuthEvent({
      eventType: 'GOOGLE_BLOCKED',
      email: null,
      reason: 'exchange_unreachable',
    });
    return redirectTo('/login?error=google_failed');
  }

  // ── Hand the identity to Supabase ──────────────────────────────────────
  // ⚠ `access_token` is not optional padding. Google's ID tokens carry an
  // `at_hash` claim, and the installed auth-js compares the hash of this value
  // against it — omit it and a perfectly good token is rejected.
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
    access_token: accessToken,
  });

  if (error || !data?.user) {
    // ⭐ THE REFUSAL ARRIVES HERE NOW. The hook aborted a user creation, which
    // means this address has no account with us — the ordinary, designed
    // outcome of a stranger clicking the button, not a malfunction.
    const refusedByHook = HOOK_REFUSAL.test(error?.message ?? '');

    if (!refusedByHook) {
      console.error('Google ID token rejected by Supabase:', error?.message);
    }

    await logAuthEvent({
      eventType: 'GOOGLE_BLOCKED',
      // ⚠ Null, and honestly so. We hold an ID token we could decode for an
      // address, but Supabase refused before a user existed to name, and the
      // logbook's other refusals record what the door knew, not what could be
      // reconstructed. Inventing a value here would make this row look like a
      // different kind of evidence than it is.
      email: null,
      reason: refusedByHook ? 'no_account' : 'id_token_rejected',
    });

    return redirectTo(
      refusedByHook ? '/login?error=no_account' : '/login?error=google_failed'
    );
  }

  const user = data.user;

  // ⚠ SIGNED IN IS NOT THE SAME AS SET UP, and there is one real way to be
  // both. An invited student who never finished /welcome has an auth user and
  // NO profile row; if she now arrives by Google on the same address,
  // automatic linking attaches the identity to that half-finished account and
  // no creation happens — so the hook never fires and she lands here with a
  // session and nothing behind it. Dev has three such invites from June's
  // payments testing, so this is a live shape, not a hypothetical.
  //
  // ⓘ She is NOT stopped here: /router already sorts a user with no roles to
  // /no-access, which is the existing behaviour for that state at every other
  // door. What this does is make it VISIBLE in the logbook instead of looking
  // like an ordinary sign-in.
  const { data: profile } = await supabase
    .from('nclex_users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  await logAuthEvent({
    eventType: 'GOOGLE_LOGIN_OK',
    email: user.email ?? null,
    userId: user.id,
    reason: profile ? null : 'no_profile',
  });

  // /router is the existing post-login traffic controller — 0 roles →
  // /no-access, 1 role → that dashboard, 2+ → the role picker. Google gets no
  // routing rules of its own; a door should decide who comes in, not where
  // they end up.
  return redirectTo(next ?? '/router');
}
