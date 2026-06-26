// mynclex/components/checkout/checkout-shell.tsx
//
// The reusable checkout shell, shared by programme checkout and bank
// checkout (Slice 5.5). It owns everything that's identical regardless of
// what's being bought: the email field + dup-check (with logged-in prefill
// + own-email skip), the order-summary rail, the Pay-with-Paystack button,
// and the "what happens next" box.
//
// Two left-column layouts:
//   • children   — the legacy stacked cards (bank checkout still uses this).
//   • steps      — a step WIZARD (programme checkout, 2026-06-24). The product
//     passes its content as discrete CheckoutStep[]; the shell appends its own
//     "Your details" (email) step and renders one step at a time with a stepper
//     + Back/Next. The right rail is untouched either way — it stays the live
//     order summary + Pay button. Pay is DISABLED until the order is payable
//     (valid, non-duplicate email + the product's own validate() passing), with
//     a hint of what's left, so a half-filled form can't dead-end on a cryptic
//     "enter a valid email" after the click.
//
// Each product supplies the order line items, the post-purchase steps, and a
// buildTarget() that assembles the CheckoutTarget from its own state at pay
// time. validate() lets a product add its own pre-pay check (e.g. a cohort
// must be chosen).

'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { checkEmail, startPaymentAction } from '@/lib/payments/actions';
import { loginHref } from '@/lib/auth/safe-next';
import type { CheckoutTarget, Currency } from '@/lib/payments/types';

export interface OrderLine {
  key: string;
  name: string;
  meta?: string;
  amountMinor: number;
}

// One step in the wizard layout. `complete` drives the stepper's done-tick and
// (for the email step) the Pay gate; product steps with sensible defaults pass
// `true`.
export interface CheckoutStep {
  id: string;
  title: string;
  content: ReactNode;
  complete: boolean;
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
  steps,
  children,
}: {
  accountEmail: string | null;
  currency: Currency;
  lineItems: OrderLine[];
  railHint: string;
  nextSteps: ReactNode;
  buildTarget: () => CheckoutTarget;
  validate?: () => string | null;
  // Wizard layout: the product's content steps. When omitted, the shell
  // renders `children` as the legacy stacked layout instead.
  steps?: CheckoutStep[];
  children?: ReactNode;
}) {
  const [email, setEmail] = useState(accountEmail ?? '');
  const [dupExists, setDupExists] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeStep, setActiveStep] = useState(0);

  // Current checkout URL — so the dup panel can send a returning student to
  // /login and bring them right back here (loginHref guards the path).
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // `busy` locks the email FIELD while the dup-check is in flight. It must NOT
  // gate the Pay button: doing so let the email's onBlur dup-check (fired by the
  // very click on Pay) disable the button a beat before the click landed, so the
  // first click was swallowed and a second was needed. Pay now gates on
  // `pending` only, and pay() re-checks the email itself (see below).
  const busy = pending || checkingEmail;
  const totalMinor = lineItems.reduce((sum, li) => sum + li.amountMinor, 0);

  // Pay-gating: the rail's Pay button stays disabled until everything required
  // is filled. The product's validate() is the cohort-style check; email is
  // the binding one (and a duplicate account blocks until they log in).
  const emailValue = email.trim().toLowerCase();
  const emailValid = EMAIL_RE.test(emailValue);
  const productErr = validate?.() ?? null;
  const canPay = emailValid && !dupExists && productErr === null;
  const payBlockedReason = productErr
    ? productErr
    : !emailValid
      ? 'Add your email to continue'
      : dupExists
        ? 'Log in to continue with this email'
        : null;

  // Where the "Log in to continue" link points: back to this checkout, with
  // the typed email prefilled. After signing in, loginAction returns them here.
  const returnPath = searchParams?.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;
  const loginUrl = loginHref(returnPath, emailValid ? { email: emailValue } : undefined);

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
      // Re-confirm the email isn't an existing account before paying as a guest.
      // The onBlur check may still be in flight (or never ran) when Pay is
      // clicked — and Pay no longer disables while it runs — so this is the
      // reliable guard. A logged-in buyer's own email is skipped: they ARE that
      // account. A network hiccup here falls through to init.ts as the backstop.
      const isOwnEmail =
        accountEmail != null && value === accountEmail.trim().toLowerCase();
      if (!isOwnEmail) {
        try {
          const { exists } = await checkEmail(value);
          if (exists) {
            setDupExists(true);
            setError('This email already has an account — log in to continue.');
            return;
          }
        } catch {
          // ignore — proceed; the server re-validates identity at activation.
        }
      }

      const res = await startPaymentAction({ email: value, target: buildTarget() });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.location.href = res.authorizationUrl;
    });
  }

  // The email step — owned by the shell because it owns the email state + the
  // dup-check. Used as the final wizard step, or inline in the legacy layout.
  const detailsCard = (
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
          disabled={busy}
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
          <a className="co-dup-btn" href={loginUrl}>
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
  );

  const terms = (
    <p className="co-terms">
      By continuing you agree to MyNclex&apos;s terms and any applicable cancellation policy.
    </p>
  );

  // Wizard layout = product steps + the shell's own email step.
  const wizard = steps != null;
  const allSteps: CheckoutStep[] = wizard
    ? [
        ...steps,
        { id: 'details', title: 'Your details', content: detailsCard, complete: emailValid && !dupExists },
      ]
    : [];
  const lastIdx = allSteps.length - 1;
  const safeActive = Math.min(activeStep, Math.max(0, lastIdx));

  return (
    <div className={`co-grid${wizard ? ' co-grid-wizard' : ''}`}>
      <div className="co-main">
        {wizard ? (
          <div className="co-wizard">
            {allSteps.length > 1 && (
              <ol className="co-steps">
                {allSteps.map((s, i) => (
                  <li
                    key={s.id}
                    className={`co-step${i === safeActive ? ' active' : ''}${s.complete ? ' done' : ''}`}
                  >
                    <button
                      type="button"
                      className="co-step-btn"
                      onClick={() => setActiveStep(i)}
                      aria-current={i === safeActive ? 'step' : undefined}
                    >
                      <span className="co-step-num" aria-hidden="true">
                        {s.complete && i !== safeActive ? '✓' : i + 1}
                      </span>
                      <span className="co-step-label">{s.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}

            <div className="co-step-body">{allSteps[safeActive]?.content}</div>

            <div className="co-step-nav">
              {safeActive > 0 && (
                <button
                  type="button"
                  className="co-step-back"
                  onClick={() => setActiveStep(safeActive - 1)}
                >
                  ← Back
                </button>
              )}
              {safeActive < lastIdx ? (
                <button
                  type="button"
                  className="co-step-next"
                  onClick={() => setActiveStep(safeActive + 1)}
                >
                  Next →
                </button>
              ) : (
                <span className="co-step-finish-hint">
                  {canPay ? 'All set — pay in the summary →' : payBlockedReason}
                </span>
              )}
            </div>

            {terms}
          </div>
        ) : (
          <>
            {children}
            {detailsCard}
            {terms}
          </>
        )}
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

          <button
            type="button"
            className="co-pay-btn"
            onClick={pay}
            disabled={pending || !canPay}
          >
            {pending ? 'Starting…' : 'Pay with Paystack →'}
          </button>
          {!pending && !canPay && payBlockedReason && (
            <p className="co-pay-hint">{payBlockedReason}</p>
          )}
        </div>

        <div className="co-rail-card co-next">
          <h3>What happens next</h3>
          <ol>{nextSteps}</ol>
        </div>
      </aside>

      {/* Mobile (≤768px): the rail's Pay action folds into a fixed bottom bar
          — running total + the step's forward action (Next, or Pay on the last
          step), same disabled-until-ready gating. Hidden on desktop via CSS. */}
      {wizard && (
        <div className="co-mobile-bar">
          <div className="co-mobile-total">
            <span className="lbl">
              {!canPay && safeActive === lastIdx && payBlockedReason ? payBlockedReason : 'Pay today'}
            </span>
            <span className="v">{money(totalMinor, currency)}</span>
          </div>
          {safeActive < lastIdx ? (
            <button
              type="button"
              className="co-mobile-btn"
              onClick={() => setActiveStep(safeActive + 1)}
            >
              Next →
            </button>
          ) : (
            <button
              type="button"
              className="co-mobile-btn"
              onClick={pay}
              disabled={pending || !canPay}
            >
              {pending ? 'Starting…' : 'Pay with Paystack →'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
