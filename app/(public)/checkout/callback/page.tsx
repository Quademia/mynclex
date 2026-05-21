// mynclex/app/(public)/checkout/callback/page.tsx
//
// Where Paystack sends the buyer's browser back after payment. Reads the
// ?reference, confirms it with Paystack via verifyPayment(), and shows the
// result. Minimal for slice 5.2 — slice 5.4 makes this the real "payment
// result" screen, and slice 5.3 adds the access-granting step.

import Link from 'next/link';
import { verifyPayment } from '@/lib/payments/verify';

export const dynamic = 'force-dynamic';

export default async function CheckoutCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const sp = await searchParams;
  const reference = (sp.reference ?? sp.trxref ?? '').trim();
  const result = reference ? await verifyPayment(reference) : null;

  let heading = 'No payment reference';
  let body = 'We could not find a payment to confirm.';

  if (result) {
    if (result.ok) {
      heading = result.status === 'ALREADY' ? 'Payment already confirmed' : 'Payment received';
      body = 'Your payment is confirmed. (Setting up your access comes next — slice 5.3.)';
    } else if (result.status === 'PENDING') {
      heading = 'Payment not completed';
      body = 'We didn’t see a completed payment yet. If you did pay, refresh in a moment.';
    } else if (result.status === 'FAILED') {
      heading = 'Payment failed';
      body = result.error;
    } else {
      heading = 'Something went wrong';
      body = result.error;
    }
  }

  return (
    <main style={{ maxWidth: 560, margin: '64px auto', padding: '0 20px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 22, marginBottom: 10 }}>{heading}</h1>
      <p style={{ color: 'var(--ink-mute, #667)', lineHeight: 1.5 }}>{body}</p>
      {reference && (
        <p style={{ marginTop: 14, fontSize: 12, color: 'var(--ink-faint, #99a)' }}>
          Reference: <code>{reference}</code>
        </p>
      )}
      <p style={{ marginTop: 28 }}>
        <Link href="/programmes">← Back to programmes</Link>
      </p>
    </main>
  );
}
