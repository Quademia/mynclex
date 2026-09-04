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
import { TrialCheckout } from './trial-checkout';
import { trialStateForViewer } from '@/lib/payments/trial';
import type { Currency } from '@/lib/payments/types';

export const dynamic = 'force-dynamic';

// The three ways a signed-in visitor can reach the trial page and not be able
// to start one. Said on arrival, not after they fill in the form.
//
// ⓘ Local const, never exported — a page.tsx may export only its default and
// the route config, and a stray named export fails the production build while
// dev happily runs it.
const TRIAL_BLOCKED: Record<
  'ALREADY_USED' | 'ALREADY_HAS_ACCESS' | 'NO_TRIAL_PRODUCT',
  { title: string; sub: string; body: string; href: string; cta: string }
> = {
  ALREADY_USED: {
    title: 'Your free trial has been used',
    sub: 'One trial per account',
    body:
      'This account has already had its free trial. Any paid duration picks up ' +
      'where it left off — and stacks on whatever access you have left.',
    href: '/bank-access',
    cta: 'See plans →',
  },
  ALREADY_HAS_ACCESS: {
    title: 'You already have bank access',
    sub: 'No trial needed',
    body:
      'Your access is live right now, so a trial would only spend itself on days ' +
      'you already hold. It stays available for later if your access lapses.',
    href: '/student/bank',
    cta: 'Go to the bank →',
  },
  NO_TRIAL_PRODUCT: {
    title: 'The free trial is unavailable',
    sub: 'Nothing has gone wrong with your account',
    body:
      'No trial is being offered at the moment. The paid durations are all ' +
      'available, and each one includes the full question bank.',
    href: '/bank-access',
    cta: 'See plans →',
  },
};

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
      .select('product_id, name, duration_days, kind, pack_type, status, readiness_credits, cat_allowance, price_minor_ghs, price_minor_usd')
      .eq('product_id', productId)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  // ⭐ TRIAL joins PAID here (2026-09-04). The free 7-day pass is an ordinary
  // BANK_DURATION product that costs nothing, so it belongs on this page —
  // same chrome, same rail, same email + dup-check. Only the panel below and
  // the shell's submit differ. `pack_type` still gates: a readiness pack
  // typed into the URL is still refused.
  if (
    !product ||
    product.status !== 'ACTIVE' ||
    (product.kind !== 'PAID' && product.kind !== 'TRIAL') ||
    product.pack_type !== 'BANK_DURATION'
  ) {
    redirect('/bank-access');
  }

  const amountMinor = currency === 'GHS' ? product.price_minor_ghs : product.price_minor_usd;

  // ── The trial ────────────────────────────────────────────────────────
  if (product.kind === 'TRIAL') {
    const { state } = await trialStateForViewer();

    // Three arrivals, each said out loud rather than left to fail at submit
    // — the /welcome convergence discipline: every state is an explicit,
    // tested branch. A logged-out visitor is always ELIGIBLE (the address
    // they will type is what decides, and we do not know it yet).
    if (state !== 'ELIGIBLE') {
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
              <div className="co-head-eyebrow">FREE TRIAL</div>
              <h1 className="co-head-title">{TRIAL_BLOCKED[state].title}</h1>
              <div className="co-head-sub">{TRIAL_BLOCKED[state].sub}</div>
            </div>
          </div>
          <section className="co-card">
            <p className="co-card-desc">{TRIAL_BLOCKED[state].body}</p>
            <Link className="co-change-link" href={TRIAL_BLOCKED[state].href}>
              {TRIAL_BLOCKED[state].cta}
            </Link>
          </section>
        </main>
      );
    }

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
            <div className="co-head-eyebrow">YOU&apos;RE GETTING</div>
            <h1 className="co-head-title">
              NCLEX Bank — {product.duration_days}-day free trial
            </h1>
            <div className="co-head-sub">
              Quademia NCLEX-RN question bank · no card needed
            </div>
          </div>
        </div>

        <TrialCheckout
          days={product.duration_days ?? 0}
          catAllowance={product.cat_allowance}
          readinessCredits={product.readiness_credits ?? 0}
          currency={currency}
          accountEmail={user?.email ?? null}
        />
      </main>
    );
  }

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
          <div className="co-head-sub">Quademia NCLEX-RN question bank · secured by Paystack</div>
        </div>
      </div>

      <BankCheckout
        productId={product.product_id}
        days={product.duration_days ?? 0}
        catAllowance={product.cat_allowance}
        readinessCredits={product.readiness_credits ?? 0}
        currency={currency}
        amountMinor={amountMinor}
        accountEmail={user?.email ?? null}
      />
    </main>
  );
}
