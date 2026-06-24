// mynclex/lib/programmes/payment-gating-toggle.tsx
//
// The "does payment gate access on this programme?" control (Settled
// 2026-06-24). ONE shared component, mounted on several surfaces (Payment
// plans page, Enrolments roster, programme Overview, the edit modal) — all
// driving the ONE server action, so the same thing happens wherever it's
// flipped. The toggle is always its OWN self-contained immediate action +
// confirm: it never rides a host form's batched save. That's what keeps it
// identical everywhere and keeps the live consequence (auto-resuming paused
// students) off a generic settings save.
//
// Flow: flip the switch → confirm dialog (copy depends on direction) →
// server action → the switch settles + a result toast (with the resumed
// count when turning off) → router.refresh() so every surface re-reads.

'use client';

import { useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Switch } from './form-controls';
import { InfoToast } from '@/lib/toast/info-toast';
import { ErrorToast } from '@/lib/toast/error-toast';
import { setProgrammePaymentGatingAction } from './actions';

export function PaymentGatingToggle({
  programmeId,
  enabled,
  className,
}: {
  programmeId: string;
  enabled: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  // The pending target value while the confirm dialog is open (null = closed).
  const [confirmTo, setConfirmTo] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function apply() {
    const next = confirmTo;
    if (next === null) return;
    setError(null);
    startTransition(async () => {
      const res = await setProgrammePaymentGatingAction(programmeId, next);
      setConfirmTo(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOn(res.enabled);
      if (res.enabled) {
        setInfo(
          'Payment now gates access — students overdue on a payment plan may be paused by tonight’s check.'
        );
      } else if (res.resumedCount > 0) {
        const n = res.resumedCount;
        setInfo(
          `Payment no longer gates access on this programme. ${n} ${
            n === 1 ? 'student' : 'students'
          } paused for a late payment ${n === 1 ? 'was' : 'were'} resumed.`
        );
      } else {
        setInfo('Payment no longer gates access on this programme.');
      }
      router.refresh();
    });
  }

  return (
    <div className={className}>
      <div className="prog-switch-field">
        <div className="prog-switch-text">
          <span className="prog-switch-label">Pause access for late payments</span>
          <span className="prog-switch-help">
            On → a student overdue on a deposit/instalment plan is paused until they pay or
            you give them more time. Off → you track payments without ever locking a student
            out of this programme.
          </span>
        </div>
        <Switch
          on={on}
          onChange={(next) => setConfirmTo(next)}
          disabled={pending}
          ariaLabel="Pause access for late payments"
        />
      </div>

      {confirmTo !== null && (
        <GatingConfirm
          turningOn={confirmTo}
          pending={pending}
          onCancel={() => {
            if (!pending) setConfirmTo(null);
          }}
          onConfirm={apply}
        />
      )}

      <InfoToast message={info} onDismiss={() => setInfo(null)} />
      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </div>
  );
}

// Plain confirm (not type-to-confirm — this isn't destructive). Reuses the
// shared overlay styling for parity with the app's other confirms; portals to
// <body> so it escapes a host card's stacking context (roster row / plans
// card / edit modal).
function GatingConfirm({
  turningOn,
  pending,
  onCancel,
  onConfirm,
}: {
  turningOn: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="auth-delete-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div
        className="auth-delete-confirm"
        role="alertdialog"
        aria-label="Confirm payment-gating change"
        aria-modal="true"
      >
        <p className="auth-delete-confirm-title">
          {turningOn ? 'Pause access for late payments?' : 'Stop pausing for late payments?'}
        </p>
        <p className="auth-delete-confirm-hint">
          {turningOn
            ? 'Students who are behind on a payment plan may be paused by tonight’s automatic check. You can turn this back off any time.'
            : 'Students currently paused for a late payment will regain access immediately, and future late payments won’t pause anyone on this programme. Students you paused by hand stay paused. You can turn this back on any time.'}
        </p>
        <div className="auth-delete-confirm-actions">
          <button
            type="button"
            className="auth-btn auth-btn-ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="auth-btn auth-btn-primary"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Saving…' : turningOn ? 'Turn on' : 'Turn off'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
