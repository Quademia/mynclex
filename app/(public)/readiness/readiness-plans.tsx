'use client';

// mynclex/app/(public)/readiness/readiness-plans.tsx
//
// The pricing head (currency toggle + heading) and card grid — the
// interactive purchasing surface. Client-only for the GHS/USD toggle, a
// real feature (both prices are stored columns, not a conversion), the
// mirror of /bank-access's.
//
// PURCHASING LOGIC IS UNCHANGED by the cinematic redesign — only the
// class names/styling moved to `.rpc-*`. Renders N cards from whatever the
// catalogue returned; the count, names, credits and both prices are props,
// the unlock line is derived against the live published-pack count, money
// maths is imported (one voice: "GHS 100"), and the CTA still links to
// /checkout/readiness. Nothing about "three SKUs" is baked in.

import { useState } from 'react';
import { formatMinor, percentOff, type Currency } from '@/lib/products/money';
import { unitPriceMinor } from '@/lib/products/savings';

export interface ReadinessSku {
  productId:    string;
  name:         string;
  credits:      number;
  ghsMinor:     number;
  usdMinor:     number;
  fullGhsMinor: number | null;
  fullUsdMinor: number | null;
}

interface Props {
  skus:        ReadinessSku[];
  /** Published, active packs — the denominator in "pick any 3 of 5". */
  packCount:   number;
  /** Non-null only when every published pack agrees on n AND time. */
  uniformLine: string | null;
  /** Server-chosen starting currency (from the visitor's country). The
   *  toggle still overrides it; defaults to GHS if a caller omits it. */
  initialCurrency?: Currency;
}

/**
 * What the card promises, derived — never the SKU's identity (see the long
 * note in git history / §12): a sixth published pack silently turns
 * yesterday's "unlocks every pack" into "pick any 5 of 6". The
 * unlocks-everything branch states NO count (Sam, 2026-07-08).
 */
function unlockLine(credits: number, packCount: number): { text: string; muted: boolean } {
  if (packCount === 0) return { text: 'Pick your packs once they publish', muted: true };
  if (credits >= packCount) return { text: 'Unlocks every pack', muted: false };
  return { text: `Pick any ${credits} of ${packCount} packs`, muted: false };
}

export function ReadinessPlans({ skus, packCount, uniformLine, initialCurrency = 'GHS' }: Props) {
  const [currency, setCurrency] = useState<Currency>(initialCurrency);

  return (
    <>
      <div className="rpc-pricing-head rpc-reveal">
        <div>
          <div className="rpc-eyebrow">Pricing</div>
          <h2>Choose your <span className="rpc-serif">credits</span></h2>
          {uniformLine && <p className="rpc-uniform">{uniformLine} · a credit is spendable on any published pack.</p>}
        </div>
        <div className="rpc-fx" role="group" aria-label="Currency">
          <button type="button" className={currency === 'GHS' ? 'on' : ''} onClick={() => setCurrency('GHS')}>GHS</button>
          <button type="button" className={currency === 'USD' ? 'on' : ''} onClick={() => setCurrency('USD')}>USD</button>
        </div>
      </div>

      <div className="rpc-plan-grid rpc-reveal">
        {skus.map((s) => {
          const price = currency === 'GHS' ? s.ghsMinor : s.usdMinor;
          const full = currency === 'GHS' ? s.fullGhsMinor : s.fullUsdMinor;
          const discount = percentOff(price, full);
          const unlock = unlockLine(s.credits, packCount);
          const unit = s.credits >= 2 ? unitPriceMinor(price, s.credits) : null;

          return (
            <div key={s.productId} className="rpc-plan">
              <div className="rpc-plan-name">{s.name}</div>
              <div className="rpc-plan-grants">
                {s.credits} pack credit{s.credits === 1 ? '' : 's'}
              </div>

              <div className="rpc-plan-pricing">
                <div className="rpc-plan-price">{formatMinor(price, currency)}</div>
                {discount != null && full != null && (
                  <>
                    <div className="rpc-plan-strike">{formatMinor(full, currency)}</div>
                    <div className="rpc-plan-off">−{discount}%</div>
                  </>
                )}
              </div>
              {unit != null && (
                <div className="rpc-plan-unit">{formatMinor(unit, currency)} per pack</div>
              )}

              <div className="rpc-plan-feats">
                <div className={`rpc-feat${unlock.muted ? ' muted' : ''}`}>
                  <StarIcon />
                  <span className="main">{unlock.text}</span>
                </div>
                <div className="rpc-feat">
                  <ClockIcon />
                  <span className="sub">One shot each · 21-day window on activation</span>
                </div>
              </div>

              <a
                className="rpc-plan-btn"
                href={`/checkout/readiness?product=${encodeURIComponent(s.productId)}&currency=${currency}`}
              >
                Get credits
              </a>
            </div>
          );
        })}
      </div>

      <p className="rpc-plans-note">
        Longer <a href="/bank-access">bank passes</a> include pack credits at no extra cost.
      </p>
    </>
  );
}

function StarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6L5.7 21l2.3-7.2-6-4.4h7.6z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
