// mynclex/app/(public)/checkout/[programmeId]/checkout-form.tsx
//
// The interactive half of programme checkout (Slice 5.4a). Upfront-full
// is the only live path; the payment-strategy and bank-opt-in cards are
// disabled "coming soon" placeholders (Slices 7 and 5.4b) so the page
// already reads as the full prototype.
//
// Flow: pick a cohort (tutor-led), enter email → we dup-check it against
// existing accounts BEFORE Paystack (returning students log in instead of
// paying as guests) → Pay starts the payment (writes the INIT row, returns
// the Paystack URL) and we send the browser there.

'use client';

import { useState, useTransition } from 'react';
import { checkEmail, startPaymentAction } from '@/lib/payments/actions';

export interface CohortOption {
  id: string;
  label: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CheckoutForm({
  programmeId,
  selfPaced,
  cohorts,
  programmeTitle,
  currencyLabel,
  amount,
}: {
  programmeId: string;
  selfPaced: boolean;
  cohorts: CohortOption[];
  programmeTitle: string;
  currencyLabel: string | null;
  amount: string;
}) {
  const singleCohort = cohorts.length === 1;
  const [cohortId, setCohortId] = useState(cohorts[0]?.id ?? '');
  const [email, setEmail] = useState('');
  const [dupExists, setDupExists] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const busy = pending || checkingEmail;

  // Dup-check on blur: an existing account pauses checkout (log in instead).
  async function onEmailBlur() {
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setDupExists(false);
      return;
    }
    setCheckingEmail(true);
    try {
      const { exists } = await checkEmail(value);
      setDupExists(exists);
    } catch {
      // Network blip — don't block; the server re-checks at activation.
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
    if (!selfPaced && !cohortId) {
      setError('Please choose a cohort to join.');
      return;
    }
    if (dupExists) {
      setError('This email already has an account — log in to continue.');
      return;
    }

    startTransition(async () => {
      const res = await startPaymentAction({
        email: value,
        target: { kind: 'PROGRAMME', programmeId, cohortId: selfPaced ? null : cohortId },
      });
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
        {/* payment strategy — placeholder (Slice 7) */}
        <section className="co-card">
          <div className="co-card-head">
            <h2>Choose a payment strategy</h2>
            <span className="co-soon-tag">More options soon</span>
          </div>
          <div className="co-strats">
            <label className="co-strat on">
              <span className="co-radio" aria-hidden="true" />
              <span className="co-strat-meta">
                <span className="nm">Upfront — full</span>
                <span className="sub">Pay once today. Full programme access on approval.</span>
              </span>
              <span className="co-strat-price">
                {currencyLabel && <span className="ccy">{currencyLabel}</span>}
                {amount}
              </span>
            </label>
            <div className="co-strat disabled" aria-disabled="true">
              <span className="co-radio" aria-hidden="true" />
              <span className="co-strat-meta">
                <span className="nm">Deposit + balance</span>
                <span className="sub">Pay part now, the rest later.</span>
              </span>
              <span className="co-soon-pill">Coming soon</span>
            </div>
            <div className="co-strat disabled" aria-disabled="true">
              <span className="co-radio" aria-hidden="true" />
              <span className="co-strat-meta">
                <span className="nm">Equal installments</span>
                <span className="sub">Split into monthly payments.</span>
              </span>
              <span className="co-soon-pill">Coming soon</span>
            </div>
          </div>
        </section>

        {/* bank opt-in — placeholder (Slice 5.4b) */}
        <section className="co-card co-card-muted">
          <div className="co-card-head">
            <h2>
              Add NCLEX Bank access <span className="co-off-tag">40% OFF</span>
            </h2>
            <span className="co-soon-pill">Coming soon</span>
          </div>
          <p className="co-card-desc">
            A recommended add-on (not required): the full QAcademy question bank at 40% off
            the standalone price, stacking on any access you already have. You&apos;ll be able
            to add it right here at checkout shortly.
          </p>
        </section>

        {/* details + dup-check */}
        <section className="co-card">
          <h2>Your details</h2>
          <p className="co-card-desc">
            We check this email against existing accounts <em>before</em> Paystack — so
            returning students log in instead of paying as guests.
          </p>

          {!selfPaced && (
            <label className="co-field">
              <span className="co-field-label">Cohort</span>
              {singleCohort ? (
                <span className="co-fixed-cohort">{cohorts[0].label}</span>
              ) : (
                <select
                  className="co-input"
                  value={cohortId}
                  onChange={(e) => setCohortId(e.target.value)}
                  disabled={busy}
                >
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}

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
              We&apos;ll email your receipt and your account-setup link here. We&apos;ll ask
              your name when you set up your account.
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
          By continuing you agree to MyNclex&apos;s terms and the tutor&apos;s programme
          cancellation policy.
        </p>
      </div>

      {/* summary rail */}
      <aside className="co-rail">
        <div className="co-rail-card">
          <h3>Order summary</h3>
          <div className="co-line">
            <div>
              <div className="nm">{programmeTitle}</div>
              <div className="meta">Upfront full{selfPaced ? '' : ' · selected cohort'}</div>
            </div>
            <div className="amt">
              {currencyLabel && <span className="ccy">{currencyLabel}</span>}
              {amount}
            </div>
          </div>
          <div className="co-total">
            <div className="lbl">Pay today</div>
            <div className="v">
              {currencyLabel && <span className="ccy">{currencyLabel}</span>}
              {amount}
            </div>
          </div>
          <p className="co-rail-hint">
            {selfPaced
              ? 'One-off. Programme access unlocks immediately after payment.'
              : 'One-off. Programme content unlocks once the tutor approves your enrolment (usually within 24 h).'}
          </p>

          <button
            type="button"
            className="co-pay-btn"
            onClick={pay}
            disabled={busy || dupExists}
          >
            {pending ? 'Starting…' : 'Pay with Paystack →'}
          </button>
        </div>

        <div className="co-rail-card co-next">
          <h3>What happens next</h3>
          <ol>
            <li>Pay through Paystack (this page redirects).</li>
            <li>We email you a link to set your name + password.</li>
            {selfPaced ? (
              <li>Your programme is ready the moment you log in.</li>
            ) : (
              <>
                <li>Your programme shows as “Pending approval”.</li>
                <li>The tutor approves → it unlocks.</li>
              </>
            )}
          </ol>
        </div>
      </aside>
    </div>
  );
}
