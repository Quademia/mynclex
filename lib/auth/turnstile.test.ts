import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Same shape as events.test.ts: vi.mock factories hoist above the imports,
// so anything they close over has to hoist with them.
const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: () => mocks.headers(),
}));

import {
  verifyTurnstile,
  isTurnstileConfigured,
  TURNSTILE_FIELD,
} from './turnstile';

const SITE_KEY = 'test-site-key';
const SECRET_KEY = 'test-secret-key';

function headerBag(entries: Record<string, string> = {}) {
  const lower = Object.fromEntries(
    Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v])
  );
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

/** A siteverify reply, as Cloudflare shapes it. */
function siteverify(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('verifyTurnstile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The module narrates every unusual branch to console.error, and most
    // of the tests below aim straight at one.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    process.env.TURNSTILE_SECRET_KEY = SECRET_KEY;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = SITE_KEY;
    mocks.headers.mockResolvedValue(headerBag({ 'cf-connecting-ip': '41.66.1.9' }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  });

  it('passes a token Cloudflare accepts', async () => {
    vi.stubGlobal('fetch', vi.fn(() => siteverify({ success: true })));

    await expect(verifyTurnstile('good-token')).resolves.toEqual({
      passed: true,
      reason: 'ok',
    });
  });

  it('refuses a token Cloudflare rejects, and keeps its reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        siteverify({ success: false, 'error-codes': ['invalid-input-response'] })
      )
    );

    await expect(verifyTurnstile('forged')).resolves.toEqual({
      passed: false,
      reason: 'invalid-input-response',
    });
  });

  it('refuses an empty token without calling Cloudflare at all', async () => {
    const fetchMock = vi.fn(() => siteverify({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyTurnstile('')).resolves.toEqual({
      passed: false,
      reason: 'missing_token',
    });
    await expect(verifyTurnstile(null)).resolves.toMatchObject({
      passed: false,
    });
    await expect(verifyTurnstile(undefined)).resolves.toMatchObject({
      passed: false,
    });

    // The point of the branch: a spray arriving with no tokens must not
    // cost us one outbound request per attempt.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ⭐ The four fail-open branches. Each one is the difference between
  // "we did not rate-limit for ten minutes" and "nobody in the world can
  // sign in", and each is easy to invert by accident — a refactor that
  // moves any of these to passed:false looks tidier and takes the product
  // down at the front door.
  describe('fails open', () => {
    it('when the network throws', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ENOTFOUND'))));

      await expect(verifyTurnstile('t')).resolves.toEqual({
        passed: true,
        reason: 'unreachable',
      });
    });

    it('when siteverify answers with an HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn(() => siteverify({}, 503)));

      await expect(verifyTurnstile('t')).resolves.toEqual({
        passed: true,
        reason: 'unreachable',
      });
    });

    it("when Cloudflare says the failure was its own", async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          siteverify({ success: false, 'error-codes': ['internal-error'] })
        )
      );

      await expect(verifyTurnstile('t')).resolves.toEqual({
        passed: true,
        reason: 'unreachable',
      });
    });

    it('when no keys are configured', async () => {
      delete process.env.TURNSTILE_SECRET_KEY;
      const fetchMock = vi.fn(() => siteverify({ success: true }));
      vi.stubGlobal('fetch', fetchMock);

      await expect(verifyTurnstile('t')).resolves.toEqual({
        passed: true,
        reason: 'disabled',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ⭐ The misconfiguration that would be an outage rather than a hole:
  // secret present, site key missing means no widget renders anywhere, so
  // no token is ever sent, so every sign-in on the site is refused for a
  // reason no screen can explain. One flag derived from both keys is what
  // stops it, and this is the test that keeps the second half of that
  // condition from being deleted as redundant.
  it('is switched off unless BOTH keys are present', async () => {
    expect(isTurnstileConfigured()).toBe(true);

    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    expect(isTurnstileConfigured()).toBe(false);

    const fetchMock = vi.fn(() => siteverify({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(verifyTurnstile('t')).resolves.toMatchObject({
      passed: true,
      reason: 'disabled',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the secret and the token, and never the site key', async () => {
    const fetchMock = vi.fn(() => siteverify({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await verifyTurnstile('  padded-token  ');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sent = new URLSearchParams(init.body as string);

    expect(sent.get('secret')).toBe(SECRET_KEY);
    // Trimmed: a stray newline from a copy-paste or a form encoder would
    // otherwise be sent verbatim and rejected as a forged token.
    expect(sent.get('response')).toBe('padded-token');
    expect(init.body as string).not.toContain(SITE_KEY);
  });

  it('passes the caller IP to Cloudflare when the headers carry one', async () => {
    const fetchMock = vi.fn(() => siteverify({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await verifyTurnstile('t');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URLSearchParams(init.body as string).get('remoteip')).toBe(
      '41.66.1.9'
    );
  });

  it('still verifies when there are no headers to read', async () => {
    // Outside a request scope next/headers throws. That must cost us the
    // optional IP and nothing else — an unverified caller is a far worse
    // outcome than an unscored one.
    mocks.headers.mockRejectedValue(new Error('called outside a request'));
    const fetchMock = vi.fn(() => siteverify({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyTurnstile('t')).resolves.toMatchObject({ passed: true });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URLSearchParams(init.body as string).has('remoteip')).toBe(false);
  });
});

describe('TURNSTILE_FIELD', () => {
  // Not decoration. This is the name Cloudflare's widget gives its hidden
  // input; the three server actions read FormData by this exact string.
  // Change it and every auth form silently starts sending nothing, which
  // fails open — so no test but this one would notice.
  it('matches the name the widget writes', () => {
    expect(TURNSTILE_FIELD).toBe('cf-turnstile-response');
  });
});
