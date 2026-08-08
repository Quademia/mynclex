import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.mock factories are hoisted above the imports, so the spies they
// close over have to be hoisted too.
const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  from: vi.fn(),
  headers: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: () => mocks.headers(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => mocks.createServiceRoleClient(),
}));

import { logAuthEvent, clientIpFrom } from './events';

/** A stand-in for Next's read-only headers object. */
function headerBag(entries: Record<string, string>) {
  const lower = Object.fromEntries(
    Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v])
  );
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

const CHROME_ON_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

describe('logAuthEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Silence the module's own diagnostics — several tests below drive it
    // straight into them on purpose.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.createServiceRoleClient.mockReturnValue({ from: mocks.from });
    mocks.headers.mockResolvedValue(
      headerBag({
        'user-agent': CHROME_ON_ANDROID,
        'cf-connecting-ip': '102.176.94.11',
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes one row with the request decoded', async () => {
    await logAuthEvent({
      eventType: 'LOGIN_FAIL',
      email: '  Ama.Mensah@Example.COM ',
      reason: 'invalid_credentials',
    });

    expect(mocks.from).toHaveBeenCalledWith('nclex_auth_events');
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith({
      event_type: 'LOGIN_FAIL',
      // Lowercased and trimmed HERE, so no call site has to remember —
      // the slice-2c threshold counts group by this column, and
      // 'Ama@x.com' vs 'ama@x.com' would be two students to that query.
      email: 'ama.mensah@example.com',
      user_id: null,
      user_exists: null,
      device_label: 'Android · Chrome',
      ip_address: '102.176.94.11',
      reason: 'invalid_credentials',
    });
  });

  it('keeps the absent fields absent rather than inventing them', async () => {
    await logAuthEvent({ eventType: 'LOGIN_OK', userId: 'u-1', email: 'a@b.com' });

    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_exists: null, reason: null, user_id: 'u-1' })
    );
  });

  it('records user_exists=false — the anti-enumeration case', async () => {
    // The PAGE must not admit the address is unknown; the LOG must.
    await logAuthEvent({
      eventType: 'RESET_REQUESTED',
      email: 'wrong@yahoo.com',
      userExists: false,
    });

    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_exists: false, email: 'wrong@yahoo.com' })
    );
  });

  // ⭐ THE CONTRACT. This module sits in the login path; if any of these
  // rethrew, a broken logbook would become a product-wide lockout — the
  // exact failure build-order item 2 exists to remove.
  describe('never throws, whatever fails underneath', () => {
    it('survives the insert being rejected by the database', async () => {
      mocks.insert.mockResolvedValue({ error: { message: 'violates check constraint' } });
      await expect(logAuthEvent({ eventType: 'LOGIN_OK' })).resolves.toBeUndefined();
      // ...and says so, because supabase-js RETURNS this failure rather
      // than throwing it. Without the check, the table would look
      // healthy while recording nothing.
      expect(console.error).toHaveBeenCalled();
    });

    it('survives the database being unreachable', async () => {
      mocks.insert.mockRejectedValue(new Error('fetch failed'));
      await expect(logAuthEvent({ eventType: 'LOGIN_OK' })).resolves.toBeUndefined();
    });

    it('survives a missing service-role key', async () => {
      mocks.createServiceRoleClient.mockImplementation(() => {
        throw new Error('supabaseKey is required');
      });
      await expect(logAuthEvent({ eventType: 'LOGIN_OK' })).resolves.toBeUndefined();
    });

    it('survives having no request headers', async () => {
      mocks.headers.mockRejectedValue(new Error('called outside a request scope'));
      await expect(logAuthEvent({ eventType: 'LOGIN_OK' })).resolves.toBeUndefined();
    });

    it('still writes the row when the headers say nothing useful', async () => {
      mocks.headers.mockResolvedValue(headerBag({}));
      await logAuthEvent({ eventType: 'LOGIN_OK', email: 'a@b.com' });

      expect(mocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({ device_label: null, ip_address: null })
      );
    });
  });
});

describe('clientIpFrom', () => {
  const from = (h: Record<string, string>) => clientIpFrom((n) => h[n] ?? null);

  it('prefers Cloudflare’s header — the edge writes it, the caller cannot', () => {
    expect(
      from({ 'cf-connecting-ip': '102.176.94.11', 'x-forwarded-for': '10.0.0.1' })
    ).toBe('102.176.94.11');
  });

  it('takes the client from the front of an x-forwarded-for chain', () => {
    expect(from({ 'x-forwarded-for': '102.176.94.11, 172.16.0.4, 10.0.0.1' })).toBe(
      '102.176.94.11'
    );
  });

  it('falls back to x-real-ip last', () => {
    expect(from({ 'x-real-ip': '102.176.94.11' })).toBe('102.176.94.11');
  });

  it('reads IPv6, including localhost', () => {
    expect(from({ 'cf-connecting-ip': '2001:db8::8a2e:370:7334' })).toBe(
      '2001:db8::8a2e:370:7334'
    );
    expect(from({ 'cf-connecting-ip': '::1' })).toBe('::1');
  });

  it('strips an IPv6 zone index, which INET rejects', () => {
    expect(from({ 'cf-connecting-ip': 'fe80::1%eth0' })).toBe('fe80::1');
  });

  // ⚠ The real job of the shape check: ip_address is INET, so a junk
  // value makes Postgres reject the whole INSERT — losing the event to
  // protect a field that no rule enforces on. Junk becomes null and the
  // row still lands.
  it('drops anything that is not obviously an address', () => {
    expect(from({ 'x-forwarded-for': 'unknown' })).toBeNull();
    expect(from({ 'x-forwarded-for': '<script>' })).toBeNull();
    expect(from({ 'x-forwarded-for': "'; DROP TABLE nclex_auth_events; --" })).toBeNull();
    expect(from({ 'cf-connecting-ip': '   ' })).toBeNull();
    expect(from({})).toBeNull();
  });
});
