// mynclex/lib/payments/installment-cta.tsx
//
// The "what you owe next" affordance for a single enrolment (Slice 7d).
// Reusable on purpose — it sits on the student programme row today and will
// drop onto the My-Payments page (Slice 5.7) later. Renders nothing when the
// plan is fully paid (next === null). The Pay button opens the installment
// checkout for this enrolment; the amount is re-resolved server-side there.

'use client';

import Link from 'next/link';
import { formatMoney } from '@/lib/strategies/format';
import type { NextPaymentView } from './schedule';

function formatDue(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function InstallmentCta({ next }: { next: NextPaymentView | null }) {
  if (!next) return null;

  const amount = formatMoney(next.currency, next.amountMinor);
  const due = formatDue(next.dueDateIso);

  return (
    <div className={`inst-cta${next.isOverdue ? ' is-overdue' : ''}`}>
      <span className="inst-cta-info">
        {next.isOverdue ? (
          <>
            Payment overdue — <strong>{amount}</strong> was due {due}
          </>
        ) : (
          <>
            Next payment — <strong>{amount}</strong> due {due}
          </>
        )}
        <span className="inst-cta-progress">
          {' '}
          · payment {next.index} of {next.totalPayments}
        </span>
      </span>
      <Link
        className="inst-cta-pay"
        href={`/checkout/installment/${next.enrolmentId}`}
      >
        {next.isOverdue ? 'Pay now' : 'Pay'}
      </Link>
    </div>
  );
}
