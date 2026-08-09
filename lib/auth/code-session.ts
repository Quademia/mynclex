// mynclex/lib/auth/code-session.ts
//
// Which address is waiting for a sign-in code — build-order item 3,
// slice 3c. One cookie, three helpers.
//
// ⭐ THIS EXISTS BECAUSE SHE LEAVES THE BROWSER. That is not an edge case,
// it is the flow: request a code, switch to Gmail, read six digits, come
// back. On a phone that is low on memory the browser quietly discards the
// tab while she is gone and reloads it when she returns. If "you are on
// step 2, for this address" lived only in React state, she would come back
// to an empty email box — and asking for another code is what trips the
// per-address limit slice 3c just built. A student punished because the
// app forgot where she was.
//
// A cookie survives that reload, and survives the app-switch that caused
// it. It is the difference between this door working and this door working
// on a desktop.
//
// ⭐⭐ IT IS SET WHETHER OR NOT THE ACCOUNT EXISTS, AND THAT IS LOAD-BEARING.
// requestCodeAction answers identically for a real address and an unknown
// one, so the screen cannot be used to discover who has an account here.
// A cookie set only for real addresses would hand that answer straight
// back through a side channel — same leak, different door. Whatever the
// action decides, this cookie is written, so the two cases stay
// indistinguishable from outside. See app/login/code-actions.ts.
//
// ⓘ It is not a security boundary and is not treated as one. Anyone can
// forge it; all they achieve is being shown a code box for an address
// whose code goes to somebody else's inbox. verifyOtp requires the address
// and the code to match, so the guarantee comes from Supabase, not from
// here. This is a convenience that has to be leak-free, not a lock.

import 'server-only';

import { cookies } from 'next/headers';

/**
 * ⚠ Not prefixed `nclex_` — that rule is for DATABASE objects (CLAUDE.md
 * rule 1, the extraction mechanism). A cookie is not extracted with the
 * schema. Named for what it holds so it is recognisable in devtools when
 * a student is on a support call.
 */
export const PENDING_CODE_COOKIE = 'mynclex-pending-code';

/**
 * Matched to the code's own life (1 hour — the shared Email OTP Expiration,
 * see docs/email/auth-templates.md). A cookie outliving its code would
 * strand her on a code box holding six digits that can no longer work; one
 * dying first would throw away a code that still could.
 *
 * ⚠ If that dial is ever changed, change this with it. They are two
 * statements of one fact and nothing keeps them in step.
 */
const PENDING_CODE_MAX_AGE_SEC = 60 * 60;

/**
 * Remember that this address is waiting for a code.
 *
 * ⚠ Server Actions and Route Handlers only. Next.js forbids writing a
 * cookie during a render, so a page cannot call this — which is correct
 * here anyway: rendering the login page should never claim someone is
 * mid-flow.
 */
export async function rememberPendingCodeEmail(email: string): Promise<void> {
  const jar = await cookies();
  jar.set(PENDING_CODE_COOKIE, email, {
    // Not readable from JavaScript. Nothing in the browser needs it — the
    // server decides which step to render — and a login-adjacent value
    // that scripts can read is one an injected script can read too.
    httpOnly: true,
    // Plain http on localhost, encrypted everywhere else. Hardcoding true
    // would make the cookie silently vanish in local dev, where this flow
    // is developed and tested.
    secure: process.env.NODE_ENV === 'production',
    // 'strict' would drop the cookie when she returns by following a link
    // out of her email client — which is the single most likely way she
    // comes back to this page.
    sameSite: 'lax',
    path: '/',
    maxAge: PENDING_CODE_MAX_AGE_SEC,
  });
}

/** The address waiting for a code, or null if nobody is mid-flow. */
export async function readPendingCodeEmail(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(PENDING_CODE_COOKIE)?.value?.trim();
  return value ? value.toLowerCase() : null;
}

/**
 * Drop it — on a successful sign-in, or when she chooses a different door.
 *
 * ⚠ NOT called when a request is refused by the per-address limit. Being
 * blocked means she has already had codes (the rule only trips on the
 * fourth request in an hour), so at least one of them may still be live.
 * Clearing here would take away the code box while she is holding a code
 * that still works — punishing her twice for one limit.
 */
export async function forgetPendingCodeEmail(): Promise<void> {
  const jar = await cookies();
  jar.delete(PENDING_CODE_COOKIE);
}
