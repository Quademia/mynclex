// mynclex/lib/auth/turnstile.ts
//
// Cloudflare Turnstile, server side — build-order item 2, slice 2d. This is
// layer 1 of the three in domain-and-identity.md → "Rate limiting: three
// layers", and it runs ABOVE slice 2c's per-email thresholds in every
// public auth action.
//
// ⭐ WHY THIS LAYER IS NOT OPTIONAL, restated so it survives the next
// reader. 2c counts failures per EMAIL ADDRESS. That catches many attempts
// against one account and is completely blind to the opposite attack: one
// machine trying a single common password against ten thousand DIFFERENT
// addresses, where every address carries exactly one failure and no rule
// ever trips. Gamma watched that door with a device-fingerprint axis whose
// query — read the SQL, not the summary — carries no email filter at all.
// We dropped that axis on purpose (2a keeps quasi-identifying hashes out
// of the table) and this is the substitute. Until it shipped, that door
// had no lock.
//
// ⭐ IT FAILS OPEN, THE SAME WAY thresholds.ts DOES, AND FOR THE SAME
// REASON. A pass that is missing or forged is refused — that is the whole
// job. But if Cloudflare itself cannot be reached, the caller is ALLOWED
// through. Closed is the instinctive choice and the wrong one: it turns
// someone else's outage into "nobody in the world can sign in", and 2c's
// counters are still standing underneath. An attacker cannot reach this
// branch either — there is no way for them to break OUR server's outbound
// call to Cloudflare, so fail-open is not a door they can open.
//
// ⭐ NOT CONFIGURED MEANS OFF — BOTH HALVES, TOGETHER. The check is
// disabled unless the secret AND the public site key are both present.
// Reading the site key here looks redundant (only the browser renders the
// widget) and is the thing that stops the one misconfiguration that would
// be an outage: secret set, site key missing, so no widget renders, no
// token is ever sent, and every sign-in on the site is refused for a
// reason no screen can explain. One flag, derived from both, cannot drift.

import 'server-only';

import { headers } from 'next/headers';
import { clientIpFrom } from './events';

/** Cloudflare's verification endpoint. */
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * A hanging call to Cloudflare must not become a hanging sign-in. Five
 * seconds is far beyond a healthy round-trip and still under any patience
 * a student has; past it we treat Cloudflare as unreachable and fail open.
 */
const VERIFY_TIMEOUT_MS = 5000;

/**
 * The name the token arrives under. Cloudflare's widget writes a hidden
 * input with exactly this name, so it rides along in the FormData every
 * server action already receives — no extra plumbing at the call sites.
 */
export const TURNSTILE_FIELD = 'cf-turnstile-response';

/**
 * Cloudflare's own word for "the failure was mine, retry". Treated as an
 * outage rather than a refusal — see the fail-open note in the header.
 */
const CLOUDFLARE_SIDE_ERROR = 'internal-error';

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

export type TurnstileVerdict = {
  passed: boolean;
  /**
   * Short note for the console and the logbook — 'ok', 'disabled',
   * 'missing_token', 'unreachable', or Cloudflare's own error code
   * ('invalid-input-response', 'timeout-or-duplicate', …). Never shown to
   * the student; the forms print one fixed sentence instead.
   */
  reason: string;
};

/**
 * Whether the check is switched on at all. Both keys or neither — see the
 * header. Exported so tests can assert the wiring, and so a future
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
 * Best-effort caller address for Cloudflare's own scoring.
 *
 * ⚠ Passed to THEM, never enforced on by US. Sending it sharpens
 * Cloudflare's judgement; reading it as a rule of our own is the one thing
 * thresholds.ts forbids outright, because Ghanaian mobile carriers put
 * thousands of subscribers behind a handful of addresses. Reuses events.ts
 * so there is one parser for this and not two.
 */
async function callerIp(): Promise<string | null> {
  try {
    const h = await headers();
    return clientIpFrom((name) => h.get(name));
  } catch {
    return null;
  }
}

/**
 * Check one pass with Cloudflare.
 *
 * @param token the widget's response, straight out of FormData — call
 *              sites pass `formData.get(TURNSTILE_FIELD)` and nothing else.
 */
export async function verifyTurnstile(
  token: FormDataEntryValue | string | null | undefined
): Promise<TurnstileVerdict> {
  if (!isTurnstileConfigured()) {
    // ⭐ PASSES, and that is the same fail-open call as everything else
    // here: a missing key is a broken check, and a broken check must not
    // become "nobody can sign in". A forgotten Worker secret would
    // otherwise take the whole product down at the front door.
    //
    // Loud on every single call, deliberately, because the cost of that
    // choice is a protection layer that is off while the deploy checklist
    // says it shipped. This line is the only thing that says otherwise.
    console.error('[turnstile] NOT CONFIGURED — auth forms are unprotected');
    return { passed: true, reason: 'disabled' };
  }

  const response = typeof token === 'string' ? token.trim() : '';
  if (!response) {
    // No outbound call for this one: an empty field is already the answer,
    // and a spray arriving without tokens is exactly the traffic this
    // layer exists to stop before it costs us anything.
    return { passed: false, reason: 'missing_token' };
  }

  // AbortController rather than AbortSignal.timeout: the same code runs on
  // the Cloudflare Worker and in local Node, and this form is supported
  // everywhere both of them have been.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const body = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY!,
      response,
    });

    const ip = await callerIp();
    if (ip) body.set('remoteip', ip);

    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error('[turnstile] siteverify HTTP', res.status, '— failing open');
      return { passed: true, reason: 'unreachable' };
    }

    const data = (await res.json()) as {
      success?: boolean;
      'error-codes'?: string[];
    };

    if (data.success === true) return { passed: true, reason: 'ok' };

    const codes = data['error-codes'] ?? [];

    // Cloudflare saying "that was my fault" is an outage, not a verdict on
    // the caller, so it lands on the same side as an unreachable endpoint.
    if (codes.includes(CLOUDFLARE_SIDE_ERROR)) {
      console.error('[turnstile] cloudflare internal-error — failing open');
      return { passed: true, reason: 'unreachable' };
    }

    return { passed: false, reason: codes[0] ?? 'rejected' };
  } catch (err) {
    // Network down, DNS gone, or our own 5-second abort. All the same
    // thing from here: we could not ask, so we do not refuse.
    console.error('[turnstile] siteverify failed — failing open', err);
    return { passed: true, reason: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}
