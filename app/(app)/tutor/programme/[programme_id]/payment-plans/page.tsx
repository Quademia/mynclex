// mynclex/app/(app)/tutor/programme/[programme_id]/payment-plans/page.tsx
//
// Tutor payment-plans surface (Payments Slice 7b). Lists the
// programme's payment plans and lets the tutor add / edit /
// deactivate deposit + installment plans. Upfront is shown but its
// amount is edited via the programme price box (Phasing 2).
//
// Always shown (per Sam's call), but when the programme collects
// payment off-platform a notice makes clear the plans aren't used at
// checkout. RLS scopes the read to the tutor's own programme; a
// programme that isn't theirs 404s.

import { notFound } from 'next/navigation';
import { getPaymentPlansContext } from '@/lib/strategies/queries';
import { PaymentPlansPanel } from '@/lib/strategies/payment-plans-panel';

export const dynamic = 'force-dynamic';

export default async function PaymentPlansPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;
  const ctx = await getPaymentPlansContext(programme_id);
  if (!ctx) notFound();

  const offPlatform = ctx.programme.payment_collection_mode === 'OFF_PLATFORM';

  return (
    <div className="pp-page">
      <header className="pp-page-head">
        <h1 className="pp-page-title">Payment plans</h1>
        <p className="pp-page-sub">
          How students can pay to enrol on this programme. Pay-in-full is
          always here; add a deposit or installment plan to offer more
          flexible options.
        </p>
      </header>

      {offPlatform && (
        <div className="pp-offline-notice" role="note">
          <strong>This programme collects payment offline.</strong> These
          plans aren&apos;t shown to students at checkout — you&apos;re
          collecting fees directly. Turn on{' '}
          <em>Online checkout</em> in the programme&apos;s settings to use
          them.
        </div>
      )}

      <PaymentPlansPanel
        programmeId={ctx.programme.programme_id}
        currency={ctx.programme.price_currency}
        strategies={ctx.strategies}
      />
    </div>
  );
}
