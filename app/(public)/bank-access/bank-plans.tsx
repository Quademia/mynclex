// mynclex/app/(public)/bank/bank-plans.tsx
//
// FIRST-CUT DESIGN. Client half of the bank landing: the GHS/USD toggle and
// the 5 duration tiers. "Get access" is inert for now — it wires into the
// shared checkout once we've agreed the layout.

'use client';

import Link from 'next/link';
import { useState } from 'react';

export interface BankPlan {
  productId: string;
  days: number;
  readinessCredits: number;
  ghsMinor: number;
  usdMinor: number;
}

type Currency = 'GHS' | 'USD';

function money(minor: number, currency: Currency): string {
  const major = minor / 100;
  const amount = Number.isInteger(major) ? major.toLocaleString('en-US') : major.toFixed(2);
  return currency === 'GHS' ? `GHS ${amount}` : `$${amount}`;
}

export function BankPlans({ plans }: { plans: BankPlan[] }) {
  const [currency, setCurrency] = useState<Currency>('GHS');

  return (
    <section className="bank-plans">
      <div className="bank-plans-head">
        <h2>Choose how long you need</h2>
        <div className="bank-fx" role="group" aria-label="Currency">
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

      <div className="bank-plan-grid">
        {plans.map((p) => {
          const minor = currency === 'GHS' ? p.ghsMinor : p.usdMinor;
          const popular = p.days === 90;
          return (
            <div key={p.productId} className={`bank-plan${popular ? ' popular' : ''}`}>
              {popular && <div className="bank-plan-badge">Most popular</div>}
              <div className="bank-plan-days">{p.days} days</div>
              <div className="bank-plan-price">{money(minor, currency)}</div>
              <ul className="bank-plan-feats">
                <li>Full question bank</li>
                <li>Practice &amp; exam modes</li>
                {p.readinessCredits > 0 ? (
                  <li>
                    {p.readinessCredits} readiness pack{p.readinessCredits === 1 ? '' : 's'} included
                  </li>
                ) : (
                  <li className="muted">No readiness packs</li>
                )}
              </ul>
              <Link
                className="bank-plan-btn"
                href={`/checkout/bank?product=${p.productId}&currency=${currency}`}
              >
                Get access →
              </Link>
            </div>
          );
        })}
      </div>

      <div className="bank-trial">
        <div>
          <strong>Not sure yet?</strong> Try the bank free for 7 days — no card needed.
        </div>
        <button type="button" className="bank-trial-btn" disabled>
          Start free trial
        </button>
      </div>

      <p className="bank-stack-note">
        Already have bank access? Any new duration <strong>stacks</strong> on top of what&apos;s left
        — you never lose time.
      </p>
    </section>
  );
}
