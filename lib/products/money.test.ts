// mynclex/lib/products/money.test.ts
//
// The geo → default-currency picker. Pure; the only branching a public
// pricing page does before first paint.

import { describe, it, expect } from 'vitest';
import { defaultCurrencyForCountry } from './money';

describe('defaultCurrencyForCountry', () => {
  it('Ghana defaults to GHS', () => {
    expect(defaultCurrencyForCountry('GH')).toBe('GHS');
  });

  it('is case-insensitive and tolerates whitespace', () => {
    expect(defaultCurrencyForCountry('gh')).toBe('GHS');
    expect(defaultCurrencyForCountry(' GH ')).toBe('GHS');
  });

  it('other countries default to USD', () => {
    for (const c of ['US', 'GB', 'CA', 'NG', 'IN', 'AU']) {
      expect(defaultCurrencyForCountry(c)).toBe('USD');
    }
  });

  it('unknown location falls back to GHS (never strand a local on USD)', () => {
    expect(defaultCurrencyForCountry(null)).toBe('GHS');
    expect(defaultCurrencyForCountry(undefined)).toBe('GHS');
    expect(defaultCurrencyForCountry('')).toBe('GHS');
  });

  it("Cloudflare's non-country sentinels are treated as unknown → GHS", () => {
    expect(defaultCurrencyForCountry('XX')).toBe('GHS'); // unknown/reserved
    expect(defaultCurrencyForCountry('T1')).toBe('GHS'); // Tor
  });
});
