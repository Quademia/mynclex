// mynclex/app/(public)/checkout/bank/bank-checkout.tsx
//
// The bank-specific panel for standalone bank checkout. A single line item;
// the shared CheckoutShell does email + dup-check + Pay. Currency was chosen
// on the /bank landing and carried through here.

'use client';

import Link from 'next/link';
import { CheckoutShell, money, type OrderLine } from '@/components/checkout/checkout-shell';
import type { Currency } from '@/lib/payments/types';
import { bankPlanIncludes } from '@/lib/products/bank-includes';

export function BankCheckout({
  productId,
  days,
  catAllowance,
  readinessCredits,
  currency,
  amountMinor,
  accountEmail,
}: {
  productId: string;
  days: number;
  catAllowance: number | null;
  readinessCredits: number;
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

  // Same bullets the /bank-access card showed — confirm the selection right
  // before payment, from the one shared source so the two can't disagree.
  const includes = bankPlanIncludes({ catAllowance, readinessCredits });

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
            <div className="co-plan-sub">Stacks on any existing access — you never lose time</div>
          </div>
          <div className="co-plan-amt">{money(amountMinor, currency)}</div>
        </div>
        <ul className="co-plan-includes">
          {includes.map((f) => (
            <li key={f.key} className={f.tone === 'muted' ? 'muted' : ''}>
              <CoTick />{f.label}
            </li>
          ))}
        </ul>
      </section>
    </CheckoutShell>
  );
}

function CoTick() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}
