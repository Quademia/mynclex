// mynclex/lib/auth/turnstile.ts
//
// Cloudflare Turnstile, server side — build-order item 2, slice 2d. Layer 1
// of the three in domain-and-identity.md → "Rate limiting: three layers",
// running above slice 2c's per-email thresholds in every public auth action.
//
// ⭐ WHY THIS LAYER IS NOT OPTIONAL, restated so it survives the next
// reader. 2c counts failures per EMAIL ADDRESS. That catches many attempts
// against one account and is completely blind to the opposite attack: one
// machine trying a single common password against ten thousand DIFFERENT
// addresses, where every address carries exactly one failure and no rule
// ever trips. Gamma watched that door with a device-fingerprint axis whose
// query — read the SQL, not the summary — carries no email filter at all.
// We dropped that axis on purpose (2a keeps quasi-identifying hashes out of
// the table) and this is the substitute.
//
// ⭐⭐ WE DO NOT VERIFY THE TOKEN. SUPABASE DOES. READ THIS BEFORE CHANGING
// ANYTHING HERE.
//
// A Turnstile token can be validated exactly ONCE — Cloudflare's own
// words, "each token can only be validated once", and a second attempt
// comes back `timeout-or-duplicate`. The first cut of this slice
// (2026-08-08) called Cloudflare's siteverify from here, which worked, and
// made Supabase's native captcha setting IMPOSSIBLE to switch on: our call
// spent the token, so Supabase would have been handed a spent one and
// refused every sign-in, signup and reset on the site.
//
// ⚠ domain-and-identity.md asked for both — "verified server-side inside
// the server action ... (use the native Supabase↔Turnstile integration so
// the direct endpoint also demands a token)". That is not buildable, and
// the doc has been corrected. One token, one check, and the question is
// only WHO gets it.
//
// Supabase gets it, because it is the only one of the two standing at BOTH
// doors. Our anon key is public by design — it ships in every page — so
// anyone can call Supabase's auth endpoint directly and never touch our
// server actions. A check that lives only here cannot see that caller at
// all; Supabase's own setting binds them. Our forms therefore hand the
// token straight through, untouched, in `options.captchaToken`.
//
// What is left here is deliberately cheap and NON-CONSUMING:
//   1. Is Turnstile switched on at all?
//   2. Did a token arrive?
// A missing token is refused and logged right here, before the database is
// touched — which is exactly the traffic this layer exists to stop, since
// a script spraying addresses sends no token at all. Whether a token that
// DID arrive is genuine is Supabase's answer to give, and we record it
// (see isCaptchaRejection).
//
// ⭐ NOT CONFIGURED MEANS OFF — BOTH HALVES, TOGETHER. Disabled unless the
// secret AND the public site key are present. Reading the site key here
// looks redundant (only the browser renders the widget) and is what stops
// the one misconfiguration that would be an outage rather than a hole:
// secret set, site key missing, so no widget renders anywhere, no token is
// ever sent, and every sign-in on the site is refused for a reason no
// screen can explain. One flag derived from both cannot drift.
//
// ⓘ The secret is still needed on this side even though we never call
// Cloudflare: it is what Supabase verifies with, and its presence is how
// this module knows the integration is configured. It lives in .env.local
// for dev and as a Worker secret in both deployed environments.

import 'server-only';

/**
 * The name the token arrives under. Cloudflare's widget writes a hidden
 * input with exactly this name, so it rides along in the FormData every
 * server action already receives — no extra plumbing at the call sites.
 */
export const TURNSTILE_FIELD = 'cf-turnstile-response';

/**
 * The one sentence every form shows when a pass is refused — shared so the
 * three auth surfaces cannot drift into three different explanations of
 * the same event.
 *
 * ⚠ It says nothing about WHY, on purpose. The reasons ("no token
 * arrived", "already spent", "forged") are for the console and the
 * logbook; to the student they are all the same problem with the same fix.
 * "Refresh the page" is that fix, and it is literal — a reload mints a new
 * pass, which is the only thing that can actually clear this.
 *
 * ⓘ Not Sam-copy-passed yet.
 */
export const TURNSTILE_FAILED_MESSAGE =
  'We could not verify your browser. Please refresh the page and try again.';

export type TurnstileTicket =
  /**
   * Carry on. `token` is undefined when Turnstile is switched off, which
   * call sites pass to Supabase unchanged — Supabase ignores a captcha
   * token when its own captcha setting is off, so the same code path works
   * either side of that switch.
   */
  | { ok: true; token: string | undefined }
  | { ok: false; reason: string };

/**
 * Whether the integration is switched on at all. Both keys or neither —
 * see the header. Exported so tests can assert the wiring, and so a future
 * diagnostics surface can say "Turnstile: off" out loud rather than
 * leaving it to be inferred from behaviour.
 */
export function isTurnstileConfigured(): boolean {
  return Boolean(
    process.env.TURNSTILE_SECRET_KEY &&
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  );
}

/**
 * Take the token out of the submitted form, without spending it.
 *
 * Synchronous and free: no network call, no headers, no database. That is
 * the point — the cheapest possible refusal for the cheapest possible
 * attack.
 *
 * @param token the widget's response, straight out of FormData — call
 *              sites pass `formData.get(TURNSTILE_FIELD)` and nothing else.
 */
export function readTurnstileTicket(
  token: FormDataEntryValue | string | null | undefined
): TurnstileTicket {
  if (!isTurnstileConfigured()) {
    // ⭐ PASSES, and that is a deliberate fail-open, matching
    // thresholds.ts: a missing key is a broken check, and a broken check
    // must not become "nobody can sign in". A forgotten Worker secret
    // would otherwise take the whole product down at the front door.
    //
    // Loud on every single call, because the cost of that choice is a
    // protection layer that is off while the deploy checklist says it
    // shipped. This line is the only thing that says otherwise.
    console.error('[turnstile] NOT CONFIGURED — auth forms are unprotected');
    return { ok: true, token: undefined };
  }

  const value = typeof token === 'string' ? token.trim() : '';
  if (!value) return { ok: false, reason: 'missing_token' };

  return { ok: true, token: value };
}

/**
 * Did Supabase refuse this call because of the captcha, rather than
 * because of the credentials?
 *
 * ⭐ THE DISTINCTION IS NOT COSMETIC — IT DECIDES WHICH EVENT TYPE GETS
 * WRITTEN, and therefore whether a student can be locked out of her own
 * account by a problem that was never about her password. A captcha
 * rejection logged as LOGIN_FAIL would feed 2c's counter; five of them and
 * she is blocked for ten minutes on an account she typed correctly every
 * time. Logged as LOGIN_BLOCKED it is excluded from those counts by
 * construction, which is the same reasoning 2a used to give blocks their
 * own type.
 *
 * ⚠ Matched on the message text because that is what Supabase gives us —
 * there is no stable error code for it. Deliberately broad: any auth error
 * mentioning the captcha counts. Over-matching costs a row written as
 * BLOCKED instead of FAIL; under-matching costs a student her account for
 * ten minutes, so the failure modes are not symmetrical and this leans the
 * safe way.
 */
export function isCaptchaRejection(message: string | null | undefined): boolean {
  return typeof message === 'string' && /captcha/i.test(message);
}
