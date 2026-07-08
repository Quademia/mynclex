'use client';

// mynclex/app/(public)/readiness/readiness-plans.tsx
//
// The pricing grid — the ONLY interactive part of /readiness, and the
// only reason this file is a client component. The GHS/USD toggle is a
// real feature (both prices are stored columns, not a conversion), the
// mirror of /bank-access's. Everything else on the page is static
// server-rendered markup.
//
// Renders N cards from whatever the catalogue returned. Nothing about
// "three SKUs" survives here: the count, the names, the credits and both
// prices are props, and the unlock line is computed against the live
// published-pack count. Money maths is imported, never re-derived —
// see lib/products/money.ts and savings.ts (one money voice: "GHS 100").

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
}

/**
 * What the card promises, derived — never the SKU's identity. A sixth
 * published pack silently turns yesterday's "unlocks every pack" into
 * "pick any 5 of 6", with nobody editing anything.
 *
 * The unlocks-everything branch states NO count (Sam, 2026-07-08). "All 5
 * packs" advertises how many packs we have shipped, which is operational
 * trivia the buyer never asked for and which reads badly mid-launch. The
 * count survives only in the pick-a-subset branch, where it is the thing
 * being chosen FROM and so carries real information.
 *
 * Note what we did NOT do: drive this line off `credits` alone
 * ("Unlocks 5 packs"). That over-promises whenever a SKU grants more
 * credits than there are packs to claim — a credit is spent claiming a
 * pack and nobody claims one twice, so the surplus is unspendable. The
 * admin catalogue already flags that configuration amber; the public card
 * must not contradict the warning. It would also just restate the
 * "5 pack credits" line directly above it.
 */
function unlockLine(credits: number, packCount: number): { text: string; muted: boolean } {
  if (packCount === 0) return { text: 'Pick your packs once they publish', muted: true };
  if (credits >= packCount) return { text: 'Unlocks every pack', muted: false };
  return { text: `Pick any ${credits} of ${packCount} packs`, muted: false };
}

export function ReadinessPlans({ skus, packCount, uniformLine }: Props) {
  const [currency, setCurrency] = useState<Currency>('GHS');

  return (
    <section className="rdp-plans">
      <div className="rdp-plans-head">
        <div>
          <h2>Choose your credits</h2>
          {uniformLine && <p className="rdp-uniform">{uniformLine}</p>}
        </div>
        <div className="rdp-fx" role="group" aria-label="Currency">
          <button
            type="button"
            className={currency === 'GHS' ? 'on' : ''}
            onClick={() => setCurrency('GHS')}
          >
            GHS
          </button>
          <button
            type="button"
            className={currency === 'USD' ? 'on' : ''}
            onClick={() => setCurrency('USD')}
          >
            USD
          </button>
        </div>
      </div>

      <div className="rdp-plan-grid">
        {skus.map((s) => {
          const price = currency === 'GHS' ? s.ghsMinor : s.usdMinor;
          const full = currency === 'GHS' ? s.fullGhsMinor : s.fullUsdMinor;
          const discount = percentOff(price, full);
          const unlock = unlockLine(s.credits, packCount);

          // A 1-credit SKU's "per pack" price IS its price — printing it
          // twice is noise, so the unit line starts at 2 credits.
          const unit = s.credits >= 2 ? unitPriceMinor(price, s.credits) : null;

          return (
            <div key={s.productId} className="rdp-plan">
              <div className="rdp-plan-name">{s.name}</div>
              <div className="rdp-plan-grants">
                {s.credits} pack credit{s.credits === 1 ? '' : 's'}
              </div>

              <div className="rdp-plan-pricing">
                <div className="rdp-plan-price">{formatMinor(price, currency)}</div>
                {discount != null && full != null && (
                  <>
                    <div className="rdp-plan-strike">{formatMinor(full, currency)}</div>
                    <div className="rdp-plan-off">−{discount}%</div>
                  </>
                )}
              </div>
              {unit != null && (
                <div className="rdp-plan-unit">{formatMinor(unit, currency)} per pack</div>
              )}

              <div className="rdp-plan-feats">
                <div className={`rdp-feat${unlock.muted ? ' muted' : ''}`}>
                  <StarIcon />
                  <span>{unlock.text}</span>
                </div>
                <div className="rdp-feat sub">
                  <ClockIcon />
                  <span>One shot each · 21-day window on activation</span>
                </div>
              </div>

              <button
                type="button"
                className="rdp-plan-btn"
                disabled
                title="Pack checkout is not live yet"
              >
                <LockIcon />
                Coming soon
              </button>
            </div>
          );
        })}
      </div>

      <p className="rdp-plans-note">
        Pack checkout opens shortly — longer <a href="/bank-access">bank passes</a> already
        include pack credits at no extra cost.
      </p>
    </section>
  );
}

function StarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6L5.7 21l2.3-7.2-6-4.4h7.6z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
