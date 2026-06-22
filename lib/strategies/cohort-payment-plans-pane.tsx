// mynclex/lib/strategies/cohort-payment-plans-pane.tsx
//
// The cohort Payment-plans pane (per-cohort override, 2026-06-22) — a tab on
// the cohort detail. By default a cohort inherits the programme's plans
// (shown read-only); the tutor can switch to CUSTOM pricing, which clones
// the programme's plans into the cohort's own editable set. Reuses the
// programme PaymentPlansPanel + strategy form, scoped to the cohort, plus a
// cohort full-price box (the cohort equivalent of the programme price box).
//
// Server component: fetches the cohort pricing context (RLS-gated) and
// renders the inherited preview or the editable custom set.

import { getCohortPaymentPlansContext } from './queries';
import { PaymentPlansPanel } from './payment-plans-panel';
import { describePlan, planLabel, systemLabel } from './format';
import {
  CohortUpfrontBox,
  EnableCustomPricing,
  RevertCustomPricing,
} from './cohort-pricing-controls';
import type { PaymentStrategy } from './types';
import type { Currency } from '@/lib/programmes/types';

export async function CohortPaymentPlansPane({ cohortId }: { cohortId: string }) {
  const ctx = await getCohortPaymentPlansContext(cohortId);
  if (!ctx) return null;

  const offPlatform = ctx.collectionMode === 'OFF_PLATFORM';

  return (
    <div className="pp-page">
      <header className="pp-page-head">
        <h1 className="pp-page-title">Pricing</h1>
        <p className="pp-page-sub">
          By default this cohort uses the programme&apos;s payment plans.
          Switch to custom pricing to charge this cohort differently (e.g. an
          early-bird or founding-cohort price) without changing the programme.
        </p>
      </header>

      {offPlatform && (
        <div className="pp-offline-notice" role="note">
          <strong>This programme collects payment offline.</strong> Plans
          aren&apos;t shown to students at checkout — turn on{' '}
          <em>Online checkout</em> in the programme&apos;s settings to use
          them.
        </div>
      )}

      {ctx.isCustom ? (
        <>
          <div className="pp-custom-banner" role="note">
            <div>
              <strong>Custom pricing is on for this cohort.</strong>{' '}
              <span>
                Students enrolling here pay these plans instead of the
                programme&apos;s.
              </span>
            </div>
            <RevertCustomPricing cohortId={cohortId} />
          </div>

          <CohortUpfrontBox
            cohortId={cohortId}
            currency={ctx.currency}
            currentMinor={ctx.upfrontMinor}
          />

          <PaymentPlansPanel
            programmeId={ctx.programmeId}
            cohortId={cohortId}
            currency={ctx.currency}
            strategies={ctx.cohortStrategies}
          />
        </>
      ) : (
        <>
          <div className="pp-inherit-banner" role="note">
            This cohort uses the programme&apos;s payment plans, shown below.
          </div>

          <ProgrammePreview
            strategies={ctx.programmeStrategies.filter((s) => s.is_active)}
            currency={ctx.currency}
          />

          <div className="pp-enable-row">
            <EnableCustomPricing cohortId={cohortId} />
          </div>
        </>
      )}
    </div>
  );
}

// Read-only render of the programme's active plans (the inherited state).
function ProgrammePreview({
  strategies,
  currency,
}: {
  strategies: PaymentStrategy[];
  currency: Currency;
}) {
  if (strategies.length === 0) {
    return (
      <p className="pp-empty">This programme has no active payment plans yet.</p>
    );
  }
  return (
    <ul className="pp-list pp-list-readonly">
      {strategies.map((s) => (
        <li key={s.strategy_id} className="pp-card">
          <div className="pp-card-main">
            <div className="pp-card-head">
              <span className="pp-card-title">{planLabel(s)}</span>
              <span className="pp-pill is-active">Active</span>
            </div>
            {planLabel(s) !== systemLabel(s.kind) && (
              <span className="pp-card-kind">{systemLabel(s.kind)}</span>
            )}
            <p className="pp-card-desc">{describePlan(s, currency)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
