// mynclex/app/(public)/checkout/bank/trial-checkout.tsx
//
// The free-trial panel, sibling to bank-checkout.tsx and rendered by the
// same page (2026-09-04). It reuses CheckoutShell whole — the email field,
// the duplicate-account check, the order rail, the disabled-until-ready
// gating and the mobile bar are all things a free order needs exactly as
// much as a paid one. Only the shell's `submit` differs: no Paystack.
//
// ⭐ The dup-check is kept ON PURPOSE. An address that already has an
// account must sign in first, for the same reason it must when buying:
// otherwise the order's email resolves to an account that may already
// hold a trial, and the refusal arrives as a constraint violation after
// the form rather than as a sentence before it.
//
// ⚠ Two arrivals, two endings. A signed-in visitor is granted on the spot
// and sent to the bank. A guest gets an email carrying the /welcome link
// and stays here, so this component owns a "check your email" state —
// there is nowhere to send someone who has no account yet.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckoutShell, type OrderLine } from '@/components/checkout/checkout-shell';
import { startTrialAction } from '@/lib/payments/actions';
import { bankPlanIncludes } from '@/lib/products/bank-includes';
import type { Currency } from '@/lib/payments/types';

// What a refusal means, in words a person can act on. `error` is never
// shown raw — startTrial returns a reason, not a sentence.
const REFUSAL: Record<string, string> = {
  already_used:
    'This email has already used its free trial. Pick a plan below to keep going.',
  already_has_access:
    'You already have bank access — no need for a trial. Head to the bank and carry on.',
  no_trial_product: 'The free trial is not available right now. Please try again later.',
  invalid_email: 'Enter a valid email address.',
  error: 'Something went wrong starting your trial. Please try again.',
};

export function TrialCheckout({
  days,
  catAllowance,
  readinessCredits,
  currency,
  accountEmail,
}: {
  days: number;
  catAllowance: number | null;
  readinessCredits: number;
  currency: Currency;
  accountEmail: string | null;
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);

  const lineItems: OrderLine[] = [
    {
      key: 'trial',
      name: `NCLEX Bank — ${days}-day free trial`,
      meta: 'Full question bank access',
      amountMinor: 0,
    },
  ];

  const includes = bankPlanIncludes({ catAllowance, readinessCredits });

  // The guest ending. Nowhere to navigate — the way in is in their inbox.
  if (sentTo) {
    return (
      <section className="co-card">
        <h2>Check your email</h2>
        <p className="co-card-desc">
          Your {days}-day trial is reserved. We&apos;ve sent a link to{' '}
          <strong>{sentTo}</strong> — open it to set your password, and the bank is
          yours straight away.
        </p>
        <p className="co-card-desc">
          Nothing in your inbox after a few minutes? Check your spam folder, or{' '}
          <Link href="/login">sign in</Link> and choose &quot;Email me a sign-in
          code&quot; — your account already exists.
        </p>
      </section>
    );
  }

  return (
    <CheckoutShell
      accountEmail={accountEmail}
      currency={currency}
      lineItems={lineItems}
      railHint={`Your trial runs for ${days} days from the moment it starts.`}
      payLabel="Start free trial →"
      totalLabel="Cost today"
      detailsNote={
        <>
          We check this email against existing accounts first — so returning
          students sign in instead of starting a second trial.
        </>
      }
      submit={async (email) => {
        const res = await startTrialAction(email);
        if (!res.ok) return { ok: false, error: REFUSAL[res.reason] ?? REFUSAL.error };
        // Already had an account → granted; go and use it.
        if (res.outcome === 'ACTIVATED') return { ok: true, redirectTo: '/student/bank' };
        // Guest (or a link already out): the inbox is the next step.
        setSentTo(email);
        return { ok: true };
      }}
      nextSteps={
        <>
          <li>We email you a link to set your name + password.</li>
          <li>Open it and your {days} days start straight away.</li>
          <li>No card needed, and nothing renews — it simply ends.</li>
        </>
      }
    >
      <section className="co-card">
        <div className="co-card-head">
          <h2>Your trial</h2>
          <Link className="co-change-link" href="/bank-access">
            See paid plans
          </Link>
        </div>
        <div className="co-plan-summary">
          <div>
            <div className="co-plan-name">NCLEX Bank — {days}-day free trial</div>
            <div className="co-plan-sub">
              Buy a duration any time — it stacks on whatever is left
            </div>
          </div>
          <div className="co-plan-amt">Free</div>
        </div>
        <ul className="co-plan-includes">
          {includes.map((f) => (
            <li key={f.key} className={f.tone === 'muted' ? 'muted' : ''}>
              <CoTick />
              {f.label}
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
