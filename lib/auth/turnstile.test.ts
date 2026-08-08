import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  readTurnstileTicket,
  isTurnstileConfigured,
  isCaptchaRejection,
  TURNSTILE_FIELD,
} from './turnstile';

const SITE_KEY = 'test-site-key';
const SECRET_KEY = 'test-secret-key';

describe('readTurnstileTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The module narrates the not-configured branch to console.error, and
    // one test below aims straight at it.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    process.env.TURNSTILE_SECRET_KEY = SECRET_KEY;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = SITE_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  });

  it('hands the token back for Supabase to spend', () => {
    expect(readTurnstileTicket('a-real-looking-token')).toEqual({
      ok: true,
      token: 'a-real-looking-token',
    });
  });

  it('trims the token', () => {
    // A stray newline from a form encoder would otherwise travel to
    // Supabase verbatim and be rejected as forged.
    expect(readTurnstileTicket('  padded  ')).toEqual({
      ok: true,
      token: 'padded',
    });
  });

  it('refuses when no token arrived', () => {
    for (const empty of ['', '   ', null, undefined]) {
      expect(readTurnstileTicket(empty)).toEqual({
        ok: false,
        reason: 'missing_token',
      });
    }
  });

  // ⭐ THE WHOLE POINT OF THIS MODULE AFTER THE REWRITE. It must NOT check
  // the token with Cloudflare: a token can be validated exactly once, and
  // spending it here would hand Supabase a used one and refuse every
  // sign-in, signup and reset on the site the moment the native captcha
  // setting is switched on. A future "improvement" that adds verification
  // back here is the single most damaging edit that could be made to this
  // file, and this is the test that catches it.
  it('never calls out to Cloudflare', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    readTurnstileTicket('a-real-looking-token');
    readTurnstileTicket('');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ⭐ Fail-open, matching thresholds.ts: a missing key is a broken check,
  // and a broken check must not become "nobody can sign in".
  it('passes through with no token when Turnstile is not configured', () => {
    delete process.env.TURNSTILE_SECRET_KEY;

    expect(readTurnstileTicket('anything')).toEqual({
      ok: true,
      token: undefined,
    });
    // undefined rather than the token itself, so the call sites hand
    // Supabase nothing at all rather than something it did not ask for.
    expect(readTurnstileTicket('')).toEqual({ ok: true, token: undefined });
  });

  // ⭐ The misconfiguration that would be an outage rather than a hole:
  // secret present, site key missing means no widget renders anywhere, so
  // no token is ever sent, so every sign-in is refused for a reason no
  // screen can explain. One flag derived from both keys is what stops it,
  // and this keeps the second half from being deleted as redundant.
  it('is switched off unless BOTH keys are present', () => {
    expect(isTurnstileConfigured()).toBe(true);

    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    expect(isTurnstileConfigured()).toBe(false);
    expect(readTurnstileTicket('a-token')).toMatchObject({ token: undefined });
  });
});

describe('isCaptchaRejection', () => {
  // ⭐ This decides which EVENT TYPE gets written, so it decides whether a
  // captcha problem can lock a student out of her own account. Matched as
  // BLOCKED it is excluded from 2c's counts; missed and logged as FAIL,
  // five of them block her for ten minutes on a password she typed
  // correctly every time.
  it('recognises the ways Supabase words it', () => {
    for (const message of [
      'captcha protection: request disallowed (invalid-input-response)',
      'Captcha verification process failed',
      'CAPTCHA challenge could not be verified',
    ]) {
      expect(isCaptchaRejection(message)).toBe(true);
    }
  });

  it('leaves an ordinary credentials failure alone', () => {
    // The one that must never match — it is the normal wrong-password
    // path, and turning it into a BLOCKED row would silently disable 2c's
    // login threshold entirely.
    expect(isCaptchaRejection('Invalid login credentials')).toBe(false);
    expect(isCaptchaRejection('Email not confirmed')).toBe(false);
    expect(isCaptchaRejection('User already registered')).toBe(false);
    expect(isCaptchaRejection(null)).toBe(false);
    expect(isCaptchaRejection(undefined)).toBe(false);
  });
});

describe('TURNSTILE_FIELD', () => {
  // Not decoration. This is the name Cloudflare's widget gives its hidden
  // input; the three server actions read FormData by this exact string.
  // Change it and every auth form silently starts sending nothing.
  it('matches the name the widget writes', () => {
    expect(TURNSTILE_FIELD).toBe('cf-turnstile-response');
  });
});
