// mynclex/app/(public)/checkout/readiness/readiness-checkout.tsx
//
// The readiness-specific panel for standalone pack-credit checkout. One
// line item (the SKU, a fixed bundle of N credits); the shared
// CheckoutShell does email + dup-check + Pay. Currency was chosen on the
// /readiness landing and carried through here.
//
// buildTarget returns kind: 'BANK' — the CheckoutTarget's product-purchase
// shape. The engine (init.ts) reads the product and derives the purpose
// from pack_type (READINESS → READINESS_PURCHASE), so a readiness buy
// rides the same target as a bank buy; only the server-side routing
// differs.
//
// Interim (Slice ②b.1): the copy makes NO claiming promise. Credits mint
// unclaimed and the claim UI is Slice ②b.2 — the honest next step is "your
// credits are on your account", not "choose your packs".

'use client';

import Link from 'next/link';
import { CheckoutShell, money, type OrderLine } from '@/components/checkout/checkout-shell';
import type { Currency } from '@/lib/payments/types';

export function ReadinessCheckout({
  productId,
  name,
  credits,
  currency,
  amountMinor,
  accountEmail,
}: {
  productId: string;
  name: string;
  credits: number;
  currency: Currency;
  amountMinor: number;
  accountEmail: string | null;
}) {
  const creditsLabel = `${credits} pack credit${credits === 1 ? '' : 's'}`;

  const lineItems: OrderLine[] = [
    {
      key: 'readiness',
      name,
      meta: creditsLabel,
      amountMinor,
    },
  ];

  return (
    <CheckoutShell
      accountEmail={accountEmail}
      currency={currency}
      lineItems={lineItems}
      railHint="Your pack credits are added the moment payment is confirmed."
      buildTarget={() => ({ kind: 'BANK', productId, currency })}
      nextSteps={
        <>
          <li>Pay through Paystack (this page redirects).</li>
          <li>We email you a link to set your name + password.</li>
          <li>Your {creditsLabel} are on your account the moment you log in.</li>
        </>
      }
    >
      <section className="co-card">
        <div className="co-card-head">
          <h2>Your credits</h2>
          <Link className="co-change-link" href="/readiness">
            Change
          </Link>
        </div>
        <div className="co-plan-summary">
          <div>
            <div className="co-plan-name">{name}</div>
            <div className="co-plan-sub">
              {creditsLabel} · one shot per pack · 21-day window on activation
            </div>
          </div>
          <div className="co-plan-amt">{money(amountMinor, currency)}</div>
        </div>
      </section>
    </CheckoutShell>
  );
}
