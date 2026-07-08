// mynclex/lib/products/money.ts
//
// THE one place major-unit money (what a human types: "120.50") meets
// minor-unit money (what the database stores: 12050). Deliberately
// single-sourced: a conversion bug here prices a product at a hundredth
// of its value, and the form, the server action and the display would
// otherwise each own a copy of the arithmetic.
//
// Currency is a display concern only — GHS and USD are both 100-minor
// currencies, so the maths is shared.

export type Currency = 'GHS' | 'USD';

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  GHS: '₵',
  USD: '$',
};

/** Parsed form money: either a valid minor-unit integer, or why not. */
export type MoneyParse =
  | { ok: true;  minor: number }
  | { ok: false; error: string };

/**
 * "120.50" → 12050. Rejects >2 decimal places (the database column is
 * an integer of minor units — a third decimal is silently lost, and a
 * silently-lost price digit is exactly the bug this module exists to
 * prevent). Blank/absent → 0 when allowZero, else an error.
 */
export function parseMoneyToMinor(
  raw:      string,
  opts:     { allowBlank?: boolean } = {},
): MoneyParse {
  const text = raw.trim();

  if (text === '') {
    if (opts.allowBlank) return { ok: true, minor: 0 };
    return { ok: false, error: 'Enter a price.' };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    if (/^\d+\.\d{3,}$/.test(text)) {
      return { ok: false, error: 'Prices take at most 2 decimal places.' };
    }
    return { ok: false, error: 'Enter a price as a plain number, e.g. 120.50' };
  }

  // Split rather than multiply: 120.10 * 100 === 12009.999... in floats.
  const [whole, frac = ''] = text.split('.');
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) return { ok: false, error: 'That price is too large.' };
  return { ok: true, minor };
}

/** 12050 → "120.50"; 12000 → "120". For pre-filling form inputs. */
export function minorToInput(minor: number | null): string {
  if (minor == null) return '';
  const major = minor / 100;
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}

/** 12050 → "₵120.50". Whole amounts drop the decimals. */
export function formatMinor(minor: number, currency: Currency): string {
  const major = minor / 100;
  const amount = Number.isInteger(major)
    ? major.toLocaleString('en-US')
    : major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${CURRENCY_SYMBOL[currency]}${amount}`;
}

/** Percent off, rounded — derived from the pair, never stored. Null
 *  when there's no "was" price (or it isn't actually higher). */
export function percentOff(priceMinor: number, fullMinor: number | null): number | null {
  if (fullMinor == null || fullMinor <= priceMinor || fullMinor <= 0) return null;
  return Math.round(((fullMinor - priceMinor) / fullMinor) * 100);
}
