// mynclex/app/(public)/checkout/installment/[enrolmentId]/installment-checkout.tsx
//
// Client panel for paying a later installment / balance on an existing
// enrolment (Slice 7d). A logged-in-only flow — the shell prefills the
// account email and skips its dup-check for the buyer's own address. The
// amount is re-resolved server-side from the frozen plan (init.ts); the
// number shown here is just the display.

'use client';

import { CheckoutShell, type OrderLine } from '@/components/checkout/checkout-shell';
import type { Currency } from '@/lib/payments/types';
import type { NextPaymentView } from '@/lib/payments/schedule';

export function InstallmentCheckout({
  enrolmentId,
  programmeTitle,
  currency,
  next,
  accountEmail,
}: {
  enrolmentId: string;
  programmeTitle: string;
  currency: Currency;
  next: NextPaymentView;
  accountEmail: string | null;
}) {
  const lineItems: OrderLine[] = [
    {
      key: 'installment',
      name: programmeTitle,
      meta: `Payment ${next.index} of ${next.totalPayments}`,
      amountMinor: next.amountMinor,
    },
  ];

  return (
    <CheckoutShell
      accountEmail={accountEmail}
      currency={currency}
      lineItems={lineItems}
      railHint={
        next.isOverdue
          ? 'This payment is overdue — paying now clears it and restores your access.'
          : 'Paying keeps your enrolment on schedule.'
      }
      buildTarget={() => ({ kind: 'PROGRAMME_INSTALLMENT', enrolmentId })}
      nextSteps={
        <>
          <li>Pay through Paystack (this page redirects).</li>
          <li>Your enrolment updates as soon as the payment confirms.</li>
          {next.isOverdue && <li>Access is restored once you&apos;re caught up.</li>}
        </>
      }
    >
      <section className="co-card">
        <h2>Your payment</h2>
        <p className="co-card-desc">
          Payment {next.index} of {next.totalPayments} for{' '}
          <strong>{programmeTitle}</strong>.
        </p>
      </section>
    </CheckoutShell>
  );
}
