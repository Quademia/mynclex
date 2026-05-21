// mynclex/app/(public)/checkout/[programmeId]/checkout-form.tsx
//
// The interactive half of programme checkout. Upfront-full is the only live
// payment strategy (the strategy card is still a "coming soon" placeholder,
// Slice 7), but the BANK OPT-IN card is live (5.4b): tick it, pick a tier,
// and it rides on the SAME Paystack charge as the programme.
//
// Flow: pick a cohort (tutor-led) → optionally add bank → enter email (we
// dup-check it against existing accounts BEFORE Paystack; a logged-in
// buyer's own email is pre-filled and skips the check) → Pay starts the
// combined charge and we send the browser to Paystack.

'use client';

import { useState, useTransition } from 'react';
import { checkEmail, startPaymentAction } from '@/lib/payments/actions';
import type { Currency } from '@/lib/payments/types';

export interface CohortOption {
  id: string;
  label: string;
}

export interface BankTier {
  productId: string;
  days: number;
  standaloneMinor: number;
  discountedMinor: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function money(minor: number, currency: Currency): string {
  const major = minor / 100;
  const amount = Number.isInteger(major) ? major.toLocaleString('en-US') : major.toFixed(2);
  return currency === 'GHS' ? `GHS ${amount}` : `$${amount}`;
}

export function CheckoutForm({
  programmeId,
  selfPaced,
  cohorts,
  programmeTitle,
  currency,
  programmeMinor,
  bankTiers,
  discountPct,
  accountEmail,
}: {
  programmeId: string;
  selfPaced: boolean;
  cohorts: CohortOption[];
  programmeTitle: string;
  currency: Currency;
  programmeMinor: number;
  bankTiers: BankTier[];
  discountPct: number;
  accountEmail: string | null;
}) {
  const singleCohort = cohorts.length === 1;
  const bankAvailable = bankTiers.length > 0;
  // Default the tier selection to the 90-day pack once opted in (sensible
  // middle), but the opt-in itself starts OFF — no dark pattern.
  const defaultTierIdx = Math.max(
    0,
    bankTiers.findIndex((t) => t.days === 90)
  );

  const [cohortId, setCohortId] = useState(cohorts[0]?.id ?? '');
  const [bankOn, setBankOn] = useState(false);
  const [bankTierIdx, setBankTierIdx] = useState(defaultTierIdx);
  const [email, setEmail] = useState(accountEmail ?? '');
  const [dupExists, setDupExists] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const busy = pending || checkingEmail;
  const selectedTier = bankOn ? bankTiers[bankTierIdx] : null;
  const totalMinor = programmeMinor + (selectedTier?.discountedMinor ?? 0);

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
        target: {
          kind: 'PROGRAMME',
          programmeId,
          cohortId: selfPaced ? null : cohortId,
          bankOptIn: selectedTier ? { productId: selectedTier.productId } : null,
        },
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
              <span className="co-strat-price">{money(programmeMinor, currency)}</span>
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

        {/* bank opt-in — LIVE (5.4b) */}
        {bankAvailable && (
          <section className="co-card co-bank">
            <div className="co-card-head">
              <h2>
                Add NCLEX Bank access <span className="co-off-tag">{discountPct}% OFF</span>
              </h2>
              <label className="co-bank-toggle">
                <input
                  type="checkbox"
                  checked={bankOn}
                  onChange={(e) => setBankOn(e.target.checked)}
                  disabled={pending}
                />
                <span>I want to add bank access</span>
              </label>
            </div>
            <p className="co-card-desc">
              Recommended add-on, not required. The full QAcademy question bank, {discountPct}% off
              the standalone price — stacks on any access you already have.
            </p>

            {bankOn ? (
              <>
                <div className="co-bank-grid">
                  {bankTiers.map((t, i) => (
                    <button
                      key={t.productId}
                      type="button"
                      className={`co-bank-tier${i === bankTierIdx ? ' on' : ''}`}
                      onClick={() => setBankTierIdx(i)}
                      disabled={pending}
                    >
                      <span className="days">{t.days} days</span>
                      <span className="price">
                        {money(t.discountedMinor, currency)}
                        <span className="strike">{money(t.standaloneMinor, currency)}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <p className="co-bank-note">
                  Bank access activates immediately on payment — not gated on tutor approval. New
                  duration stacks on any existing access.
                </p>
              </>
            ) : (
              <p className="co-bank-empty">
                Tick the box above to pick a duration. Bank access is a separate QAcademy
                subscription — independent of programme enrolment.
              </p>
            )}
          </section>
        )}

        {/* details + dup-check */}
        <section className="co-card">
          <h2>Your details</h2>
          <p className="co-card-desc">
            We check this email against existing accounts <em>before</em> Paystack — so returning
            students log in instead of paying as guests.
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
            <div className="amt">{money(programmeMinor, currency)}</div>
          </div>

          {selectedTier && (
            <div className="co-line">
              <div>
                <div className="nm">NCLEX Bank — {selectedTier.days} days</div>
                <div className="meta">{discountPct}% off · stacks on existing access</div>
              </div>
              <div className="amt">{money(selectedTier.discountedMinor, currency)}</div>
            </div>
          )}

          <div className="co-total">
            <div className="lbl">Pay today</div>
            <div className="v">{money(totalMinor, currency)}</div>
          </div>
          <p className="co-rail-hint">
            {selfPaced
              ? 'Programme access unlocks immediately after payment.'
              : 'Programme content unlocks once the tutor approves your enrolment (usually within 24 h).'}
            {selectedTier ? ' Bank access is ready straight away.' : ''}
          </p>

          <button type="button" className="co-pay-btn" onClick={pay} disabled={busy || dupExists}>
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
