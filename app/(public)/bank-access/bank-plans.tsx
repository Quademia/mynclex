// mynclex/app/(public)/bank-access/bank-plans.tsx
//
// Client half of the cinematic bank landing: the Plans section — the
// GHS/USD toggle + duration tiers. This is the PURCHASING SURFACE and its
// behaviour is unchanged by the redesign: tiers/prices/credits come from
// the real nclex_products catalogue (passed as `plans`), the toggle is
// SEEDED from the visitor's geo-chosen currency (`initialCurrency`) and
// still overrides freely, and each card links to /checkout/bank with the
// chosen currency. Styling is page-scoped `.bkc-*` in styles/bank-public.css.

'use client';

import Link from 'next/link';
import { useState } from 'react';

export interface BankPlan {
  productId: string;
  days: number;
  readinessCredits: number;
  /** CATs the pass grants (§15.5): null = unlimited, 0 = none, N = N. */
  catAllowance: number | null;
  ghsMinor: number;
  usdMinor: number;
}

type Currency = 'GHS' | 'USD';

function money(minor: number, currency: Currency): string {
  const major = minor / 100;
  const amount = Number.isInteger(major) ? major.toLocaleString('en-US') : major.toFixed(2);
  return currency === 'GHS' ? `GHS ${amount}` : `$${amount}`;
}

/** "≈ GHS 10 / day" — derived, decorative. Cheap plans show 2dp, dear ones round. */
function perDay(minor: number, days: number, currency: Currency): string {
  const val = minor / 100 / days;
  const prefix = currency === 'GHS' ? 'GHS ' : '$';
  return `≈ ${prefix}${val < 10 ? val.toFixed(2) : Math.round(val)} / day`;
}

function Tick() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

export function BankPlans({
  plans,
  initialCurrency = 'GHS',
}: {
  plans: BankPlan[];
  /** Server-chosen starting currency (from the visitor's country). The
   *  toggle still overrides it; defaults to GHS if a caller omits it. */
  initialCurrency?: Currency;
}) {
  const [currency, setCurrency] = useState<Currency>(initialCurrency);

  return (
    <section id="plans" className="bkc-plans">
      <div className="bkc-plans-head bkc-reveal">
        <div>
          <div className="bkc-eyebrow">Pricing</div>
          <h2>Choose how long you need</h2>
          <p className="bkc-plans-sub">Every plan unlocks the full bank. Longer plans include readiness packs at no extra cost.</p>
        </div>
        <div className="bkc-fx" role="group" aria-label="Currency">
          <button type="button" className={currency === 'GHS' ? 'on' : ''} onClick={() => setCurrency('GHS')}>GHS</button>
          <button type="button" className={currency === 'USD' ? 'on' : ''} onClick={() => setCurrency('USD')}>USD</button>
        </div>
      </div>

      <div className="bkc-plan-grid bkc-reveal">
        {plans.map((p) => {
          const minor = currency === 'GHS' ? p.ghsMinor : p.usdMinor;
          const popular = p.days === 90;
          const hasCredits = p.readinessCredits > 0;
          // CAT line (§15.5): null = unlimited (a selling point → highlighted),
          // a positive N = that many, 0 = none (dimmed, like "no packs").
          const catUnlimited = p.catAllowance === null;
          const catNone = p.catAllowance === 0;
          return (
            <div key={p.productId} className={`bkc-plan${popular ? ' popular' : ''}`}>
              {popular && <div className="bkc-plan-badge">Most popular</div>}
              <div className="bkc-plan-days">{p.days} days</div>
              <div className="bkc-plan-price">{money(minor, currency)}</div>
              <div className="bkc-plan-perday">{perDay(minor, p.days, currency)}</div>
              <div className="bkc-plan-feats">
                <span className="bkc-feat"><Tick />Full question bank</span>
                <span className="bkc-feat"><Tick />Practice &amp; exam modes</span>
                {catUnlimited ? (
                  <span className="bkc-feat credit"><Tick />Unlimited CAT exams</span>
                ) : catNone ? (
                  <span className="bkc-feat muted"><Tick />No CAT exams</span>
                ) : (
                  <span className="bkc-feat credit"><Tick />{p.catAllowance} CAT exam{p.catAllowance === 1 ? '' : 's'} included</span>
                )}
                {hasCredits ? (
                  <span className="bkc-feat credit"><Tick />{p.readinessCredits} readiness pack{p.readinessCredits === 1 ? '' : 's'} included</span>
                ) : (
                  <span className="bkc-feat muted"><Tick />No readiness packs</span>
                )}
              </div>
              <Link className="bkc-plan-btn" href={`/checkout/bank?product=${p.productId}&currency=${currency}`}>
                Get access →
              </Link>
            </div>
          );
        })}
      </div>

      <div className="bkc-trial bkc-reveal">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2d7d72" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <div className="bkc-trial-text"><strong>Not sure yet?</strong> Try the bank free for 7 days — no card needed.</div>
        <button type="button" className="bkc-trial-btn" disabled>Start free trial</button>
      </div>
      <p className="bkc-stack-note">
        Already have bank access? Any new duration <strong>stacks</strong> on top of what&apos;s left — you never lose time.
      </p>
    </section>
  );
}
