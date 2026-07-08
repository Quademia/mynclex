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

/**
 * ONE money voice across the whole product (Sam, 2026-07-08): cedis print
 * as the ISO code, never the ₵ glyph. The public pages already did this;
 * the admin and tutor surfaces used ₵, and a split voice is just two
 * things to keep in step. Dollars keep "$" — it is read correctly by
 * everyone, and every existing surface already prints it.
 *
 * Not exported: the only legitimate way to render an amount is through
 * the formatter below, which owns the minor→major conversion too.
 */
const CURRENCY_PREFIX: Record<Currency, string> = {
  GHS: 'GHS ',
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

/** 12050 → "GHS 120.50" · 12000 → "GHS 12,000" · 2000 USD → "$20". */
export function formatMinor(minor: number, currency: Currency): string {
  const major = minor / 100;
  const amount = Number.isInteger(major)
    ? major.toLocaleString('en-US')
    : major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${CURRENCY_PREFIX[currency]}${amount}`;
}

/** Percent off, rounded — derived from the pair, never stored. Null
 *  when there's no "was" price (or it isn't actually higher). */
export function percentOff(priceMinor: number, fullMinor: number | null): number | null {
  if (fullMinor == null || fullMinor <= priceMinor || fullMinor <= 0) return null;
  return Math.round(((fullMinor - priceMinor) / fullMinor) * 100);
}

/** Smallest offer the DB accepts: full_price must be strictly above price. */
export const MIN_DISCOUNT_PCT = 1;
export const MAX_DISCOUNT_PCT = 99;

/**
 * The offer helper (Sam's idea, 2026-07-08): given the charged price and
 * a target discount, what "was" price shows exactly that discount?
 *
 *     full = price ÷ (1 − d)
 *
 * Applied to BOTH currencies with the SAME d, this is the only way the
 * two can display the same percentage — the percentage depends on the
 * full:price ratio, not on any exchange rate, and our GHS column is
 * regionally priced (3.86–4.38 GHS per $ across the bank tiers), not
 * converted. Reproduces the hand-entered readiness offers exactly:
 * GHS 350 at 30% → GHS 500; $48 at 20% → $60.
 *
 * Rounds to the nearest MINOR unit, not the nearest whole cedi/dollar.
 * Whole-unit rounding was the first attempt and it defeats the feature:
 * $30 at 20% rounds to $38, which is 21% off, while GHS 120 rounds to
 * GHS 150, which is 20% — the currencies diverge as they would by hand. The
 * relative error of minor-unit rounding is small enough that the
 * displayed percentages always agree. Numbers stay tidy wherever the
 * maths is clean (GHS 350 @30% → GHS 500), and untidy only where the true
 * answer is untidy ($30 @20% → $37.50).
 *
 * Returns null for a zero price (the trial: 0 ÷ 0.7 is still 0, and a
 * full price must exceed the price — the DB CHECK would reject it).
 *
 * This is a GENERATOR, not a binding: it fills the boxes once, then the
 * numbers are the admin's. Nothing about the discount is stored.
 */
export function fullPriceForDiscount(
  priceMinor:  number,
  discountPct: number,
): number | null {
  if (priceMinor <= 0) return null;
  if (!Number.isFinite(discountPct)) return null;
  if (discountPct < MIN_DISCOUNT_PCT || discountPct > MAX_DISCOUNT_PCT) return null;

  const full = Math.round(priceMinor / (1 - discountPct / 100));

  // A 1% discount on a 1-pesewa product rounds back onto the price;
  // the DB requires strictly greater.
  return full > priceMinor ? full : priceMinor + 1;
}
