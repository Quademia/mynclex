// mynclex/app/auth/callback/route.ts
//
// Where Google sends her back — slice 5c. Not a page; nobody looks at it.
// The browser lands here for a moment, work happens, and it redirects on.
//
// ⭐ THE `?code=` TRAP IN CLAUDE.md DOES NOT APPLY HERE, and this must not
// be "fixed" to look like /welcome. That trap is about createBrowserClient
// consuming the code in the BROWSER before the caller can, so calling
// exchangeCodeForSession yourself races the library and the loser reports
// failure for an operation that succeeded. A Route Handler owns the exchange
// legitimately — no browser client is ever constructed on this path — and it
// is the documented Supabase SSR pattern. /welcome is a different situation
// (implicit-flow fragment, handled client-side on purpose).
//
// ⭐ THE REFUSAL ARRIVES HERE TOO, and that is by design. When the
// before-user-created hook turns a stranger away
// (20260907120000_google_signin.sql), Supabase does not fail silently — it
// sends her back to this same URL carrying an error instead of a code. So one
// handler sees both endings, and GOOGLE_BLOCKED is written in TypeScript
// beside every other auth event rather than from inside a hook whose
// transaction is being rolled back.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logAuthEvent } from '@/lib/auth/events';
import { safeNext } from '@/lib/auth/safe-next';

export const dynamic = 'force-dynamic';

// The hook's own words, from the migration. Matched loosely (case-insensitive,
// substring) because it travels through a URL and an error envelope on the way
// here, and an exact-match test would quietly reclassify a real refusal as an
// unknown error the day either end reformats it.
//
// ⚠ If the message in the migration changes, change it here too. They are two
// statements of one fact and nothing keeps them in step.
const HOOK_REFUSAL = /no account found for this google address/i;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const oauthError = params.get('error');
  const oauthErrorDescription = params.get('error_description') ?? '';

  // Re-validated on the way back, not merely trusted because we set it on the
  // way out. It has been round-tripped through two external redirects since
  // then and arrives as ordinary attacker-reachable input.
  const next = safeNext(params.get('next'));

  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, request.nextUrl.origin), { status: 303 });

  // ── She was turned away ────────────────────────────────────────────────
  if (oauthError || !code) {
    const refusedByHook = HOOK_REFUSAL.test(oauthErrorDescription);

    await logAuthEvent({
      eventType: 'GOOGLE_BLOCKED',
      // ⚠ Null, and honestly so. The error redirect carries no address —
      // Supabase refused before a user existed to name. The row records that
      // a refusal happened and why; it cannot say to whom, and inventing a
      // value would be worse than the gap.
      email: null,
      reason: refusedByHook
        ? 'no_account'
        : `oauth_error:${oauthError ?? 'no_code'}`,
    });

    return redirectTo(
      refusedByHook ? '/login?error=no_account' : '/login?error=google_failed'
    );
  }

  // ── She is known to us ─────────────────────────────────────────────────
  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.user) {
    // A code that will not exchange is not a refusal of her — it is a broken
    // or replayed round trip. Recorded as a block with its own reason so it
    // is separable from the no-account case in the logbook.
    console.error('Google callback exchange failed:', error?.message);
    await logAuthEvent({
      eventType: 'GOOGLE_BLOCKED',
      email: null,
      reason: 'exchange_failed',
    });
    return redirectTo('/login?error=google_failed');
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
  // like an ordinary sign-in — see the session notes; routing her to /welcome
  // instead is a decision for Sam, not one to smuggle into this slice.
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
