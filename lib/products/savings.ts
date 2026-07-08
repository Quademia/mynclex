// mynclex/lib/products/savings.ts
//
// The readiness SKUs' "₵80/pack · 20% off" line — DERIVED at render,
// never stored (settled 2026-07-08). CD's round-1 prototype hardcoded
// "20% off" against the credit count, so editing All-5's price would
// have left the label happily lying. Here the anchor is the real
// 1-credit SKU's unit price, so every label follows the catalogue.
//
// Distinct from a PROMOTIONAL discount (full_price_minor_*, see
// money.ts → percentOff): that's "was ₵350, now ₵280". This is
// "buying five at once beats buying one five times".

import type { Currency } from './money';
import type { ProductRow } from './types';

export interface PackSavings {
  /** Price of one credit under this SKU, in minor units. */
  perPackMinor: number;
  /** Percent cheaper per pack than the 1-credit SKU. Null when there
   *  is no anchor, or this IS the anchor, or it's no cheaper. */
  percentOff:   number | null;
}

const priceOf = (p: ProductRow, c: Currency) =>
  c === 'GHS' ? p.price_minor_ghs : p.price_minor_usd;

/**
 * The unit-price anchor: the ACTIVE readiness SKU granting exactly one
 * credit. Archived SKUs are excluded — a retired product must not
 * silently set the savings maths for the live ones.
 */
export function findUnitAnchor(products: ProductRow[]): ProductRow | null {
  return (
    products.find(
      (p) =>
        p.pack_type === 'READINESS' &&
        p.status === 'ACTIVE' &&
        p.readiness_credits === 1,
    ) ?? null
  );
}

export function packSavings(
  product:  ProductRow,
  anchor:   ProductRow | null,
  currency: Currency,
): PackSavings | null {
  if (product.pack_type !== 'READINESS' || product.readiness_credits < 1) return null;

  const perPackMinor = Math.round(priceOf(product, currency) / product.readiness_credits);

  if (!anchor || anchor.product_id === product.product_id) {
    return { perPackMinor, percentOff: null };
  }

  const anchorPerPack = priceOf(anchor, currency); // anchor grants exactly 1
  if (anchorPerPack <= 0 || perPackMinor >= anchorPerPack) {
    return { perPackMinor, percentOff: null };
  }

  return {
    perPackMinor,
    percentOff: Math.round(((anchorPerPack - perPackMinor) / anchorPerPack) * 100),
  };
}
