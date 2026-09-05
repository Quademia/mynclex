// mynclex/lib/products/types.ts
//
// The buyable-SKU catalogue as the admin surface sees it. One row per
// nclex_products record; grouping + derived savings live in their own
// modules (grouping.ts, savings.ts).
//
// Column meanings settled 2026-07-08 (readiness-packs.md §7):
//   pack_type = WHAT it grants   ·  kind = WHETHER you pay
//   readiness_credits = credits minted on activation (one column, both
//     product types — bundled and standalone use the same mechanism)
//   price_minor_* = the exact integer Paystack charges
//   full_price_minor_* = optional pre-offer "was" price, decorative

export type PackType = 'BANK_DURATION' | 'READINESS';
export type ProductKind = 'PAID' | 'TRIAL';
export type ProductStatus = 'ACTIVE' | 'ARCHIVED';

export interface ProductRow {
  product_id:           string;
  name:                 string;
  kind:                 ProductKind;
  pack_type:            PackType;
  duration_days:        number | null;
  readiness_credits:    number;
  /** CATs this pass grants per window (§15.5). NULL = unlimited, 0 = none,
   *  N = N. Bank-family only — always NULL on a READINESS SKU, since a
   *  readiness-only buyer holds no bank entitlement to carry it. */
  cat_allowance:        number | null;
  price_minor_ghs:      number;
  price_minor_usd:      number;
  full_price_minor_ghs: number | null;
  full_price_minor_usd: number | null;
  status:               ProductStatus;
  sort_order:           number;
  /** Ribbon text on the public card, e.g. "Best value" (2026-09-05).
   *  NULL = no ribbon and no highlight. Free text, not a boolean, so the
   *  CLAIM is editable and not just which product wears it — "Most
   *  popular" is a fact about what customers choose, and a field lets it
   *  wait for sales rather than being asserted in code. Max 24 chars: the
   *  ribbon is one non-wrapping line on a 375px card. */
  badge:                string | null;
}

/** What the form posts (major-unit money strings; server converts). */
export interface ProductFormValues {
  product_id:        string;
  name:              string;
  kind:              ProductKind;
  pack_type:         PackType;
  duration_days:     number | null;
  readiness_credits: number;
  cat_allowance:     number | null;  // NULL = unlimited, 0 = none, N = N
  priceGhs:          number;   // minor units, post-conversion
  priceUsd:          number;
  fullPriceGhs:      number | null;
  fullPriceUsd:      number | null;
  sort_order:        number;
  badge:             string | null;   // blank in the form → NULL
}

export interface ProductActionResult {
  ok:     boolean;
  error?: string;
}

/** Live pack count — the denominator for the "unspendable credits"
 *  advisory (a credit is spent claiming a pack; nobody claims one
 *  pack twice, so credits beyond the pack count can never be used). */
export interface CatalogueData {
  products:  ProductRow[];
  packCount: number;
}
