// mynclex/lib/products/savings.ts
//
// Per-pack unit price for the readiness SKUs — "₵80/pack" — shown under
// each currency's price so it is always correct in that currency.
//
// This file used to also DERIVE a volume discount ("20% off") by
// comparing each SKU's unit price against the 1-credit SKU's. That was
// retired 2026-07-08 (Sam): a discount is now expressed exactly one way,
// via full_price_minor_* — set All-5's full price to 5 × Single and the
// row reads ~₵500~ ₵350 −30%, the same number the derived maths gave,
// but under one mechanism instead of two, and it carries to the public
// card for free. Trade-off accepted: a typed full price can drift if the
// Single pack's price later changes; a derived one couldn't.

import type { Currency } from './money';
import type { ProductRow } from './types';

/**
 * What one credit costs under this SKU, in minor units. Null for
 * anything that isn't a readiness SKU granting at least one credit
 * (bank tiers price a duration, not a pack).
 */
export function perPackMinor(product: ProductRow, currency: Currency): number | null {
  if (product.pack_type !== 'READINESS' || product.readiness_credits < 1) return null;
  const price = currency === 'GHS' ? product.price_minor_ghs : product.price_minor_usd;
  return Math.round(price / product.readiness_credits);
}
