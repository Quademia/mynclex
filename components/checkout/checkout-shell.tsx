// mynclex/components/checkout/checkout-shell.tsx
//
// The reusable checkout shell, shared by programme checkout and bank
// checkout (Slice 5.5). It owns everything that's identical regardless of
// what's being bought: the email field + dup-check (with logged-in prefill
// + own-email skip), the order-summary rail, the Pay-with-Paystack button,
// and the "what happens next" box.
//
// Each product supplies its own panel (the left-column cards) as children,
// plus the order line items, the post-purchase steps, and a buildTarget()
// that assembles the CheckoutTarget from the product's own state at pay
// time. validate() lets a product add its own pre-pay check (e.g. a cohort
// must be chosen).

'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { checkEmail, startPaymentAction } from '@/lib/payments/actions';
import type { CheckoutTarget, Currency } from '@/lib/payments/types';

export interface OrderLine {
  key: string;
  name: string;
  meta?: string;
  amountMinor: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function money(minor: number, currency: Currency): string {
  const major = minor / 100;
  const amount = Number.isInteger(major) ? major.toLocaleString('en-US') : major.toFixed(2);
  return currency === 'GHS' ? `GHS ${amount}` : `$${amount}`;
}

export function CheckoutShell({
  accountEmail,
  currency,
  lineItems,
  railHint,
  nextSteps,
  buildTarget,
  validate,
  children,
}: {
  accountEmail: string | null;
  currency: Currency;
  lineItems: OrderLine[];
  railHint: string;
  nextSteps: ReactNode;
  buildTarget: () => CheckoutTarget;
  validate?: () => string | null;
  children: ReactNode;
}) {
  const [email, setEmail] = useState(accountEmail ?? '');
  const [dupExists, setDupExists] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const busy = pending || checkingEmail;
  const totalMinor = lineItems.reduce((sum, li) => sum + li.amountMinor, 0);

  // Dup-check on blur: an existing account pauses checkout (log in instead).
  // A logged-in buyer's own email is skipped — they ARE that account.
  async function onEmailBlur() {
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setDupExists(false);
      return;
    }
    if (accountEmail && value === accountEmail.trim().toLowerCase()) {
      setDupExists(false);
      return;
    }
    setCheckingEmail(true);
    try {
      const { exists } = await checkEmail(value);
      setDupExists(exists);
    } catch {
      setDupExists(false);
    } finally {
      setCheckingEmail(false);
    }
  }

  function pay() {
    setError(null);
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setError('Enter a valid email address.');
      return;
    }
    const vErr = validate?.();
    if (vErr) {
      setError(vErr);
      return;
    }
    if (dupExists) {
      setError('This email already has an account — log in to continue.');
      return;
    }

    startTransition(async () => {
      const res = await startPaymentAction({ email: value, target: buildTarget() });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.location.href = res.authorizationUrl;
    });
  }

  return (
    <div className="co-grid">
      <div className="co-main">
        {children}

        <section className="co-card">
          <h2>Your details</h2>
          <p className="co-card-desc">
            We check this email against existing accounts <em>before</em> Paystack — so returning
            students log in instead of paying as guests.
          </p>

          <label className="co-field">
            <span className="co-field-label">Email</span>
            <input
              type="email"
              className={`co-input${dupExists ? ' has-dup' : ''}`}
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (dupExists) setDupExists(false);
              }}
              onBlur={onEmailBlur}
              disabled={pending}
            />
            <span className="co-field-help">
              We&apos;ll email your receipt and your account-setup link here. We&apos;ll ask your
              name when you set up your account.
            </span>
          </label>

          {dupExists && (
            <div className="co-dup" role="alert">
              <h4>This email already has a MyNclex account.</h4>
              <p>Log in to continue — we&apos;ll bring your existing account into this checkout.</p>
              <a className="co-dup-btn" href="/login">
                Log in to continue →
              </a>
            </div>
          )}

          {error && (
            <p className="co-error" role="alert">
              {error}
            </p>
          )}
        </section>

        <p className="co-terms">
          By continuing you agree to MyNclex&apos;s terms and any applicable cancellation policy.
        </p>
      </div>

      <aside className="co-rail">
        <div className="co-rail-card">
          <h3>Order summary</h3>
          {lineItems.map((li) => (
            <div className="co-line" key={li.key}>
              <div>
                <div className="nm">{li.name}</div>
                {li.meta && <div className="meta">{li.meta}</div>}
              </div>
              <div className="amt">{money(li.amountMinor, currency)}</div>
            </div>
          ))}

          <div className="co-total">
            <div className="lbl">Pay today</div>
            <div className="v">{money(totalMinor, currency)}</div>
          </div>
          <p className="co-rail-hint">{railHint}</p>

          <button type="button" className="co-pay-btn" onClick={pay} disabled={busy || dupExists}>
            {pending ? 'Starting…' : 'Pay with Paystack →'}
          </button>
        </div>

        <div className="co-rail-card co-next">
          <h3>What happens next</h3>
          <ol>{nextSteps}</ol>
        </div>
      </aside>
    </div>
  );
}
