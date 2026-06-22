// mynclex/lib/strategies/cohort-pricing-controls.tsx
//
// Client controls for the cohort Payment-plans pane (per-cohort override,
// 2026-06-22): the "Use custom pricing" enable button, the "Revert to
// programme pricing" button (with a confirm), and the cohort full-price box
// (the cohort equivalent of the programme price box). Each wraps a server
// action + router.refresh, surfacing errors via the shared ErrorToast.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import {
  disableCohortCustomPricingAction,
  enableCohortCustomPricingAction,
  setCohortUpfrontAction,
} from './actions';
import { formatMoney } from './format';
import type { Currency } from '@/lib/programmes/types';

function minorToMajor(minor: number): string {
  const major = minor / 100;
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}
function majorToMinor(s: string): number | null {
  const n = Number(s.trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function EnableCustomPricing({ cohortId }: { cohortId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    if (isPending) return;
    startTransition(async () => {
      const res = await enableCohortCustomPricingAction(cohortId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="prog-btn prog-btn-primary"
        onClick={run}
        disabled={isPending}
      >
        {isPending ? 'Setting up…' : 'Use custom pricing for this cohort'}
      </button>
      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}

export function RevertCustomPricing({ cohortId }: { cohortId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function run() {
    if (isPending) return;
    startTransition(async () => {
      const res = await disableCohortCustomPricingAction(cohortId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="pp-revert-confirm">
        <span>
          Revert to the programme&apos;s plans? Students already enrolled keep
          the plan they signed up to.
        </span>
        <div className="pp-revert-actions">
          <button
            type="button"
            className="prog-btn prog-btn-ghost prog-btn-sm"
            onClick={() => setConfirming(false)}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="prog-btn prog-btn-danger prog-btn-sm"
            onClick={run}
            disabled={isPending}
          >
            {isPending ? 'Reverting…' : 'Revert'}
          </button>
        </div>
        <ErrorToast error={error} onDismiss={() => setError(null)} />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="prog-btn prog-btn-ghost prog-btn-sm"
        onClick={() => setConfirming(true)}
        disabled={isPending}
      >
        Revert to programme pricing
      </button>
      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}

export function CohortUpfrontBox({
  cohortId,
  currency,
  currentMinor,
}: {
  cohortId: string;
  currency: Currency;
  currentMinor: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(
    currentMinor != null ? minorToMajor(currentMinor) : ''
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const minor = majorToMinor(value);
  const dirty = minor != null && minor !== (currentMinor ?? -1);
  const valid = minor != null && minor > 0;

  function save() {
    if (isPending || !valid || minor == null) return;
    startTransition(async () => {
      const res = await setCohortUpfrontAction(cohortId, minor);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="pp-upfront-box">
      <label className="prog-field">
        <span className="prog-field-label">
          Full price ({currency}) <span className="prog-required">*</span>
        </span>
        <div className="pp-upfront-row">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className="prog-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={isPending}
          />
          <button
            type="button"
            className="prog-btn prog-btn-secondary prog-btn-sm"
            onClick={save}
            disabled={!valid || !dirty || isPending}
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
        <span className="prog-field-help">
          What this cohort pays to enrol (pay-in-full). Deposit / installment
          plans below default to this amount.
          {currentMinor != null &&
            ` Currently ${formatMoney(currency, currentMinor)}.`}
        </span>
      </label>
      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </div>
  );
}
