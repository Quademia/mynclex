// mynclex/lib/payments/readiness-mint.ts
//
// The PURE decision behind "what does activating this product grant?" —
// extracted from activate.ts so it can be unit-tested in isolation (no
// server client, no DB). The imperative side (insert the subscription,
// mint the credit rows) lives in activate.ts and calls this.
//
// This is where the readiness-credits trap lives, so it is stated once,
// here, with teeth in the tests:
//
//   The credit COUNT is `readiness_credits`, FULL STOP — never keyed on
//   pack_type. A longer bank pass BUNDLES readiness credits (BANK_90D →
//   2) exactly as a standalone READINESS SKU grants them (SELECT3 → 3).
//   The natural-looking `if (pack_type === 'READINESS') mint...` passes
//   every readiness test, ships green, and silently drops every bundled
//   credit — nobody notices until a bank buyer asks where their pack
//   went. See readiness-packs.md §7 → "The mint rule".
//
// What pack_type DOES decide: whether a bank-time subscription is
// granted (BANK_DURATION only — a readiness purchase writes NO
// subscription row, §7), and the credit row's `source` provenance tag
// (BANK_BUNDLE vs SELF_PURCHASE). ADMIN_GRANT credits don't come through
// activation at all (no payment) — they're minted on the admin path.

export type ActivationCreditSource = 'BANK_BUNDLE' | 'SELF_PURCHASE';

export interface ActivationGrantPlan {
  /** Insert an nclex_subscriptions row? Bank passes only. */
  subscription: boolean;
  /** How many nclex_readiness_credits rows to mint (0 = none). */
  creditCount: number;
  /** The provenance tag for those credits; null iff creditCount is 0. */
  creditSource: ActivationCreditSource | null;
}

/** The only two shapes an activatable product takes. */
export interface ActivatableProduct {
  pack_type: 'BANK_DURATION' | 'READINESS';
  readiness_credits: number;
}

export function planActivationGrants(product: ActivatableProduct): ActivationGrantPlan {
  const isBankDuration = product.pack_type === 'BANK_DURATION';

  // The count is the product's readiness_credits, guarded against a
  // stray negative — NEVER a function of pack_type.
  const creditCount = Math.max(0, Math.trunc(product.readiness_credits ?? 0));

  return {
    subscription: isBankDuration,
    creditCount,
    creditSource: creditCount > 0 ? (isBankDuration ? 'BANK_BUNDLE' : 'SELF_PURCHASE') : null,
  };
}
