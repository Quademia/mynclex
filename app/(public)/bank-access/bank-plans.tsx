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
import { bankPlanIncludes } from '@/lib/products/bank-includes';

export interface BankPlan {
  productId: string;
  days: number;
  readinessCredits: number;
  /** CATs the pass grants (§15.5): null = unlimited, 0 = none, N = N. */
  catAllowance: number | null;
  /** Ribbon text from the catalogue, or null for a plain card. */
  badge: string | null;
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
  trialDays = null,
  trialProductId = null,
}: {
  plans: BankPlan[];
  /** Server-chosen starting currency (from the visitor's country). The
   *  toggle still overrides it; defaults to GHS if a caller omits it. */
  initialCurrency?: Currency;
  /** The live trial's length, or null when the catalogue offers none. */
  trialDays?: number | null;
  /** The live trial's slug, or null. Both null together, or both set. */
  trialProductId?: string | null;
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
          // ⚠ WAS `p.days === 90` UNTIL 2026-09-05 — which plan to promote,
          // and the words on the ribbon, both hardcoded in this component.
          // It broke silently: change that tier's length by any route and
          // the ribbon vanished with no error. And "Most popular" is a
          // claim about what customers choose, unprovable pre-launch and
          // un-editable without a deploy. Both now come from the catalogue.
          const popular = !!p.badge;
          const includes = bankPlanIncludes({
            catAllowance: p.catAllowance,
            readinessCredits: p.readinessCredits,
          });
          return (
            <div key={p.productId} className={`bkc-plan${popular ? ' popular' : ''}`}>
              {popular && <div className="bkc-plan-badge">{p.badge}</div>}
              <div className="bkc-plan-days">{p.days} days</div>
              <div className="bkc-plan-price">{money(minor, currency)}</div>
              <div className="bkc-plan-perday">{perDay(minor, p.days, currency)}</div>
              <div className="bkc-plan-feats">
                {includes.map((f) => (
                  <span
                    key={f.key}
                    className={`bkc-feat${f.tone === 'credit' ? ' credit' : f.tone === 'muted' ? ' muted' : ''}`}
                  >
                    <Tick />{f.label}
                  </span>
                ))}
              </div>
              <Link className="bkc-plan-btn" href={`/checkout/bank?product=${p.productId}&currency=${currency}`}>
                Get access →
              </Link>
            </div>
          );
        })}
      </div>

      {/* ⭐ LIVE SINCE 2026-09-04. This strip shipped with a `disabled` button
          and stood that way while the landing page promised seven free days in
          four places — the page's loudest claim, wired to nothing. It now
          links to the real trial, and the whole strip disappears when the
          catalogue holds no active trial rather than advertising a dead end. */}
      {trialDays && trialProductId && (
        <div className="bkc-trial bkc-reveal">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2d7d72" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <div className="bkc-trial-text">
            <strong>Not sure yet?</strong> Try the bank free for {trialDays} days — no card needed.
          </div>
          <Link
            className="bkc-trial-btn"
            href={`/checkout/bank?product=${trialProductId}&currency=${currency}`}
          >
            Start free trial
          </Link>
        </div>
      )}
      <p className="bkc-stack-note">
        Already have bank access? Any new duration <strong>stacks</strong> on top of what&apos;s left — you never lose time.
      </p>
    </section>
  );
}
