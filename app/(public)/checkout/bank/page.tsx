// mynclex/app/(public)/checkout/bank/page.tsx
//
// Standalone bank checkout (Slice 5.5). Reached from a tier's "Get access"
// on /bank, carrying ?product=<id>&currency=<GHS|USD>. Server component:
// validates the product is a real active paid bank tier (a hand-typed URL
// can't buy something else) and the currency, then renders the shared
// CheckoutShell via the bank panel. The engine already handles BANK
// purchases (5.2/5.3) — this is the UI on top.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BankCheckout } from './bank-checkout';
import type { Currency } from '@/lib/payments/types';

export const dynamic = 'force-dynamic';

export default async function BankCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; currency?: string }>;
}) {
  const sp = await searchParams;
  const currency: Currency = sp.currency === 'USD' ? 'USD' : 'GHS';
  const productId = (sp.product ?? '').trim();
  if (!productId) redirect('/bank-access');

  const supabase = await createClient();
  const [{ data: product }, { data: { user } }] = await Promise.all([
    supabase
      .from('nclex_products')
      .select('product_id, name, duration_days, kind, pack_type, status, price_minor_ghs, price_minor_usd')
      .eq('product_id', productId)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (
    !product ||
    product.status !== 'ACTIVE' ||
    product.kind !== 'PAID' ||
    product.pack_type !== 'BANK_DURATION'
  ) {
    redirect('/bank-access');
  }

  const amountMinor = currency === 'GHS' ? product.price_minor_ghs : product.price_minor_usd;

  return (
    <main className="pub-content co-content">
      <Link className="det-back" href="/bank-access">
        ← Back to plans
      </Link>

      <div className="co-head">
        <div className="co-head-avatar" aria-hidden="true">
          QA
        </div>
        <div>
          <div className="co-head-eyebrow">YOU&apos;RE BUYING</div>
          <h1 className="co-head-title">NCLEX Bank — {product.duration_days} days</h1>
          <div className="co-head-sub">QAcademy NCLEX-RN question bank · secured by Paystack</div>
        </div>
      </div>

      <BankCheckout
        productId={product.product_id}
        days={product.duration_days ?? 0}
        currency={currency}
        amountMinor={amountMinor}
        accountEmail={user?.email ?? null}
      />
    </main>
  );
}
