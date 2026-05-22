// mynclex/app/(public)/checkout/bank/bank-checkout.tsx
//
// The bank-specific panel for standalone bank checkout. A single line item;
// the shared CheckoutShell does email + dup-check + Pay. Currency was chosen
// on the /bank landing and carried through here.

'use client';

import Link from 'next/link';
import { CheckoutShell, money, type OrderLine } from '@/components/checkout/checkout-shell';
import type { Currency } from '@/lib/payments/types';

export function BankCheckout({
  productId,
  days,
  currency,
  amountMinor,
  accountEmail,
}: {
  productId: string;
  days: number;
  currency: Currency;
  amountMinor: number;
  accountEmail: string | null;
}) {
  const lineItems: OrderLine[] = [
    {
      key: 'bank',
      name: `NCLEX Bank — ${days} days`,
      meta: 'Full question bank access',
      amountMinor,
    },
  ];

  return (
    <CheckoutShell
      accountEmail={accountEmail}
      currency={currency}
      lineItems={lineItems}
      railHint="Bank access activates immediately after payment."
      buildTarget={() => ({ kind: 'BANK', productId, currency })}
      nextSteps={
        <>
          <li>Pay through Paystack (this page redirects).</li>
          <li>We email you a link to set your name + password.</li>
          <li>Your bank access is ready the moment you log in.</li>
        </>
      }
    >
      <section className="co-card">
        <div className="co-card-head">
          <h2>Your plan</h2>
          <Link className="co-change-link" href="/bank-access">
            Change plan
          </Link>
        </div>
        <div className="co-plan-summary">
          <div>
            <div className="co-plan-name">NCLEX Bank — {days} days</div>
            <div className="co-plan-sub">Full question bank · stacks on any existing access</div>
          </div>
          <div className="co-plan-amt">{money(amountMinor, currency)}</div>
        </div>
      </section>
    </CheckoutShell>
  );
}
