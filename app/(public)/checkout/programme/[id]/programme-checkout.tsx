// mynclex/app/(public)/checkout/programme/[id]/programme-checkout.tsx
//
// The programme-specific panel for checkout: cohort picker, the payment-plan
// picker (Slice 7c), and the live bank opt-in card. It owns its own state and
// feeds the shared CheckoutShell the order lines + the CheckoutTarget.
//
// Plan picker rules (settled 2026-05-22): the picker only shows when the
// programme offers 2+ active plans; with a single plan it's hidden and that
// plan is used silently. Default selection is Pay-in-full when offered, else
// the cheapest first payment. The amount charged is the chosen plan's
// initial_price_minor; init.ts re-validates it server-side.

'use client';

import { useState } from 'react';
import {
  CheckoutShell,
  money,
  type OrderLine,
  type CheckoutStep,
} from '@/components/checkout/checkout-shell';
import { systemLabel, installmentSplit } from '@/lib/strategies/format';
import type { PublicPaymentPlan } from '@/lib/strategies/types';
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

// Pick the default plan: Pay-in-full if offered, else the one with the
// smallest first payment. Returns null only when there are no plans.
function defaultPlanId(plans: PublicPaymentPlan[]): string | null {
  if (plans.length === 0) return null;
  const upfront = plans.find((p) => p.kind === 'UPFRONT_FULL');
  if (upfront) return upfront.strategy_id;
  const cheapest = [...plans].sort(
    (a, b) => a.initial_price_minor - b.initial_price_minor
  )[0];
  return cheapest.strategy_id;
}

function planTitle(p: PublicPaymentPlan): string {
  const custom = (p.label ?? '').trim();
  return custom.length > 0 ? custom : systemLabel(p.kind);
}

// Sub-line under a plan's title in the picker.
function planSub(p: PublicPaymentPlan, currency: Currency): string {
  switch (p.kind) {
    case 'UPFRONT_FULL':
      return 'Pay once today. Full programme access on approval.';
    case 'DEPOSIT_BALANCE': {
      const balance = p.total_price_minor - p.initial_price_minor;
      const days = p.balance_due_days_after_enrolment ?? 0;
      return `Deposit now, then ${money(balance, currency)} after ${days} day${
        days === 1 ? '' : 's'
      }.`;
    }
    case 'EQUAL_INSTALLMENTS': {
      const count = p.installment_count ?? 0;
      const interval = p.installment_interval_days ?? 0;
      return `${count} payments, every ${interval} day${interval === 1 ? '' : 's'}.`;
    }
  }
}

// The order-line meta for the selected plan — spells out what's owed later.
function planLineMeta(
  p: PublicPaymentPlan | null,
  selfPaced: boolean,
  currency: Currency
): string {
  const cohortBit = selfPaced ? '' : ' · selected cohort';
  if (!p) return `Upfront full${cohortBit}`;
  switch (p.kind) {
    case 'UPFRONT_FULL':
      return `Pay in full${cohortBit}`;
    case 'DEPOSIT_BALANCE': {
      const balance = p.total_price_minor - p.initial_price_minor;
      const days = p.balance_due_days_after_enrolment ?? 0;
      return `Deposit · ${money(balance, currency)} balance due in ${days} day${
        days === 1 ? '' : 's'
      }${cohortBit}`;
    }
    case 'EQUAL_INSTALLMENTS': {
      const count = p.installment_count ?? 0;
      const interval = p.installment_interval_days ?? 0;
      const { rest } = installmentSplit(p.total_price_minor, count);
      return `Installment 1 of ${count} · then ${count - 1} × ${money(
        rest,
        currency
      )} every ${interval} day${interval === 1 ? '' : 's'}${cohortBit}`;
    }
  }
}

export function ProgrammeCheckout({
  programmeId,
  selfPaced,
  cohorts,
  programmeTitle,
  currency,
  programmeMinor,
  defaultPlans,
  plansByCohort,
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
  // Programme-default plans + a per-cohort map for cohorts on custom
  // pricing (per-cohort override, 2026-06-22). The picker uses the chosen
  // cohort's plans when it has them, else the defaults.
  defaultPlans: PublicPaymentPlan[];
  plansByCohort: Record<string, PublicPaymentPlan[]>;
  bankTiers: BankTier[];
  discountPct: number;
  accountEmail: string | null;
}) {
  const singleCohort = cohorts.length === 1;
  const bankAvailable = bankTiers.length > 0;
  const defaultTierIdx = Math.max(0, bankTiers.findIndex((t) => t.days === 90));

  // Effective plans for a cohort: its custom set if any, else the defaults.
  const plansFor = (cid: string): PublicPaymentPlan[] =>
    (!selfPaced && plansByCohort[cid]) || defaultPlans;

  const initialCohortId = cohorts[0]?.id ?? '';
  const [cohortId, setCohortId] = useState(initialCohortId);
  const [planId, setPlanId] = useState<string | null>(
    defaultPlanId(plansFor(initialCohortId))
  );
  const [bankOn, setBankOn] = useState(false);
  const [bankTierIdx, setBankTierIdx] = useState(defaultTierIdx);

  // Switching cohort can swap the plan set (custom vs default), so re-pick
  // the default plan for the new cohort.
  function changeCohort(next: string) {
    setCohortId(next);
    setPlanId(defaultPlanId(plansFor(next)));
  }

  const plans = plansFor(cohortId);

  // Selected plan (null only when the programme has no plans — defensive
  // fallback to the programme's full price, no strategy).
  const selectedPlan = plans.find((p) => p.strategy_id === planId) ?? null;
  const initialMinor = selectedPlan ? selectedPlan.initial_price_minor : programmeMinor;
  const showPicker = plans.length >= 2;

  const selectedTier = bankOn ? bankTiers[bankTierIdx] : null;

  const lineItems: OrderLine[] = [
    {
      key: 'programme',
      name: programmeTitle,
      meta: planLineMeta(selectedPlan, selfPaced, currency),
      amountMinor: initialMinor,
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

  // ── Wizard steps ──────────────────────────────────────────────────
  // The left column steps through cohort+plan → bank (skippable) → email
  // (the email step is appended by CheckoutShell). Steps are built from what's
  // actually offered, so empty steps never show: self-paced drops the cohort,
  // a single plan hides the picker, no discount means no bank step.
  const cohortCard = !selfPaced ? (
    <section className="co-card" key="cohort">
      <h2>Your cohort</h2>
      <label className="co-field">
        <span className="co-field-label">Cohort</span>
        {singleCohort ? (
          <span className="co-fixed-cohort">{cohorts[0].label}</span>
        ) : (
          <select
            className="co-input"
            value={cohortId}
            onChange={(e) => changeCohort(e.target.value)}
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
  ) : null;

  // payment plan — picker shows only when 2+ plans are offered
  const planCard = showPicker ? (
    <section className="co-card" key="plan">
      <div className="co-card-head">
        <h2>Choose how to pay</h2>
      </div>
      <div className="co-strats">
        {plans.map((p) => {
          const on = p.strategy_id === planId;
          return (
            <label key={p.strategy_id} className={`co-strat${on ? ' on' : ''}`}>
              <input
                type="radio"
                name="payment-plan"
                className="co-radio-input"
                checked={on}
                onChange={() => setPlanId(p.strategy_id)}
              />
              <span className="co-radio" aria-hidden="true" />
              <span className="co-strat-meta">
                <span className="nm">{planTitle(p)}</span>
                <span className="sub">{planSub(p, currency)}</span>
              </span>
              <span className="co-strat-price">
                {money(p.initial_price_minor, currency)}
                {p.kind !== 'UPFRONT_FULL' && <span className="co-strat-now"> now</span>}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  ) : null;

  // bank opt-in — live
  const bankCard = (
    <section className="co-card co-bank" key="bank">
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
        Recommended add-on, not required. The full Quademia question bank, {discountPct}% off the
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
          Tick the box above to pick a duration. Bank access is a separate Quademia
          subscription — independent of programme enrolment.
        </p>
      )}
    </section>
  );

  const planStepHasContent = cohortCard !== null || planCard !== null;
  const planStepTitle =
    cohortCard && planCard ? 'Cohort & plan' : cohortCard ? 'Your cohort' : 'How to pay';

  const steps: CheckoutStep[] = [];
  if (planStepHasContent) {
    steps.push({
      id: 'plan',
      title: planStepTitle,
      complete: true,
      content: (
        <>
          {cohortCard}
          {planCard}
        </>
      ),
    });
  }
  if (bankAvailable) {
    steps.push({ id: 'bank', title: 'Bank access', complete: true, content: bankCard });
  }

  return (
    <CheckoutShell
      accountEmail={accountEmail}
      currency={currency}
      lineItems={lineItems}
      railHint={railHint}
      steps={steps}
      buildTarget={() => ({
        kind: 'PROGRAMME',
        programmeId,
        cohortId: selfPaced ? null : cohortId,
        strategyId: selectedPlan ? selectedPlan.strategy_id : null,
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
    />
  );
}
