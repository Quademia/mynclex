// mynclex/app/(public)/checkout/readiness/page.tsx
//
// Standalone readiness-pack checkout (Slice ②b.1). Reached from a SKU's
// "Get credits" on /readiness, carrying ?product=<id>&currency=<GHS|USD>.
// Server component: validates the product is a real active paid READINESS
// SKU (a hand-typed URL can't buy something else) and the currency, then
// renders the shared CheckoutShell via the readiness panel.
//
// The payment engine already handles this end to end — init.ts routes a
// READINESS product to purpose READINESS_PURCHASE, and activate.ts mints
// the credits (no subscription) on activation. This is the UI on top.
// Mirror of checkout/bank/page.tsx (mirror, don't share — the framing is
// credits, not bank time).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ReadinessCheckout } from './readiness-checkout';
import type { Currency } from '@/lib/payments/types';

export const dynamic = 'force-dynamic';

export default async function ReadinessCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; currency?: string }>;
}) {
  const sp = await searchParams;
  const currency: Currency = sp.currency === 'USD' ? 'USD' : 'GHS';
  const productId = (sp.product ?? '').trim();
  if (!productId) redirect('/readiness');

  const supabase = await createClient();
  const [{ data: product }, { data: { user } }] = await Promise.all([
    supabase
      .from('nclex_products')
      .select('product_id, name, kind, pack_type, status, readiness_credits, price_minor_ghs, price_minor_usd')
      .eq('product_id', productId)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (
    !product ||
    product.status !== 'ACTIVE' ||
    product.kind !== 'PAID' ||
    product.pack_type !== 'READINESS'
  ) {
    redirect('/readiness');
  }

  const amountMinor = currency === 'GHS' ? product.price_minor_ghs : product.price_minor_usd;
  const credits = product.readiness_credits ?? 0;

  return (
    <main className="pub-content co-content">
      <Link className="det-back" href="/readiness">
        ← Back to packs
      </Link>

      <div className="co-head">
        <div className="co-head-avatar" aria-hidden="true">
          QA
        </div>
        <div>
          <div className="co-head-eyebrow">YOU&apos;RE BUYING</div>
          <h1 className="co-head-title">Readiness — {product.name}</h1>
          <div className="co-head-sub">
            One shot per pack · 21-day window on activation · secured by Paystack
          </div>
        </div>
      </div>

      <ReadinessCheckout
        productId={product.product_id}
        name={product.name}
        credits={credits}
        currency={currency}
        amountMinor={amountMinor}
        accountEmail={user?.email ?? null}
      />
    </main>
  );
}
