// mynclex/app/(public)/checkout/programme/[id]/programme-checkout.tsx
//
// The programme-specific panel for checkout: cohort picker, the (placeholder)
// payment-strategy card, and the live bank opt-in card. It owns its own state
// and feeds the shared CheckoutShell the order lines + the CheckoutTarget.

'use client';

import { useState } from 'react';
import { CheckoutShell, money, type OrderLine } from '@/components/checkout/checkout-shell';
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

export function ProgrammeCheckout({
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
  const defaultTierIdx = Math.max(0, bankTiers.findIndex((t) => t.days === 90));

  const [cohortId, setCohortId] = useState(cohorts[0]?.id ?? '');
  const [bankOn, setBankOn] = useState(false);
  const [bankTierIdx, setBankTierIdx] = useState(defaultTierIdx);

  const selectedTier = bankOn ? bankTiers[bankTierIdx] : null;

  const lineItems: OrderLine[] = [
    {
      key: 'programme',
      name: programmeTitle,
      meta: `Upfront full${selfPaced ? '' : ' · selected cohort'}`,
      amountMinor: programmeMinor,
    },
    ...(selectedTier
      ? [
          {
            key: 'bank',
            name: `NCLEX Bank — ${selectedTier.days} days`,
            meta: `${discountPct}% off · stacks on existing access`,
            amountMinor: selectedTier.discountedMinor,
          },
        ]
      : []),
  ];

  const railHint =
    (selfPaced
      ? 'Programme access unlocks immediately after payment.'
      : 'Programme content unlocks once the tutor approves your enrolment (usually within 24 h).') +
    (selectedTier ? ' Bank access is ready straight away.' : '');

  return (
    <CheckoutShell
      accountEmail={accountEmail}
      currency={currency}
      lineItems={lineItems}
      railHint={railHint}
      buildTarget={() => ({
        kind: 'PROGRAMME',
        programmeId,
        cohortId: selfPaced ? null : cohortId,
        bankOptIn: selectedTier ? { productId: selectedTier.productId } : null,
      })}
      validate={() => (!selfPaced && !cohortId ? 'Please choose a cohort to join.' : null)}
      nextSteps={
        <>
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
          {selectedTier && <li>Your bank access is active right away.</li>}
        </>
      }
    >
      {/* cohort */}
      {!selfPaced && (
        <section className="co-card">
          <h2>Your cohort</h2>
          <label className="co-field">
            <span className="co-field-label">Cohort</span>
            {singleCohort ? (
              <span className="co-fixed-cohort">{cohorts[0].label}</span>
            ) : (
              <select
                className="co-input"
                value={cohortId}
                onChange={(e) => setCohortId(e.target.value)}
              >
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </label>
        </section>
      )}

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

      {/* bank opt-in — live */}
      {bankAvailable && (
        <section className="co-card co-bank">
          <div className="co-card-head">
            <h2>
              Add NCLEX Bank access <span className="co-off-tag">{discountPct}% OFF</span>
            </h2>
            <label className="co-bank-toggle">
              <input type="checkbox" checked={bankOn} onChange={(e) => setBankOn(e.target.checked)} />
              <span>I want to add bank access</span>
            </label>
          </div>
          <p className="co-card-desc">
            Recommended add-on, not required. The full QAcademy question bank, {discountPct}% off the
            standalone price — stacks on any access you already have.
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
    </CheckoutShell>
  );
}
