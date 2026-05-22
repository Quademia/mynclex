// mynclex/lib/strategies/strategy-form-modal.tsx
//
// Add / edit a payment plan (DEPOSIT_BALANCE or EQUAL_INSTALLMENTS).
// One modal, discriminated on `mode`. Reuses the prog-modal-* chrome
// + ErrorToast + DiscardConfirm conventions (same as the cohort and
// programme modals).
//
// The plan's TOTAL defaults to the programme's full price but is
// editable (installments often cost a little more — a tutor lever).
// A live preview line shows exactly what the student will be charged
// and when, computed with the same installment-split math the server
// uses, so the tutor sees the rounding before saving.

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DiscardConfirm } from '@/lib/overlays/bank/discard-confirm';
import { ErrorToast } from '@/lib/toast/error-toast';
import { createStrategyAction, editStrategyAction } from './actions';
import { installmentSplit, formatMoney } from './format';
import type {
  EditableStrategyKind,
  PaymentStrategy,
  StrategyFormValues,
} from './types';
import type { Currency } from '@/lib/programmes/types';

type StrategyFormModalProps =
  | {
      mode: 'create';
      programmeId: string;
      kind: EditableStrategyKind;
      currency: Currency;
      programmePriceMinor: number;
      onClose: () => void;
    }
  | {
      mode: 'edit';
      strategy: PaymentStrategy;
      currency: Currency;
      programmePriceMinor: number;
      onClose: () => void;
    };

function minorToMajor(minor: number): string {
  const major = minor / 100;
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}
function majorToMinor(s: string): number | null {
  const n = Number(s.trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
function intOrNull(s: string): number | null {
  const n = Number(s.trim());
  if (!Number.isInteger(n)) return null;
  return n;
}

export function StrategyFormModal(props: StrategyFormModalProps) {
  const router = useRouter();
  const { currency, programmePriceMinor } = props;
  const isEdit = props.mode === 'edit';
  // The panel only ever opens edit for DEPOSIT_BALANCE / EQUAL_INSTALLMENTS
  // (upfront has no Edit button), so narrowing the row's StrategyKind to
  // the editable subset here is safe.
  const kind: EditableStrategyKind = isEdit
    ? (props.strategy.kind as EditableStrategyKind)
    : props.kind;
  const initial = isEdit ? props.strategy : null;

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  const [label, setLabel] = useState(initial?.label ?? '');
  const [total, setTotal] = useState(
    minorToMajor(initial?.total_price_minor ?? programmePriceMinor)
  );
  // DEPOSIT_BALANCE
  const [deposit, setDeposit] = useState(
    initial && initial.kind === 'DEPOSIT_BALANCE'
      ? minorToMajor(initial.initial_price_minor)
      : ''
  );
  const [balanceDueDays, setBalanceDueDays] = useState(
    initial?.balance_due_days_after_enrolment != null
      ? String(initial.balance_due_days_after_enrolment)
      : '14'
  );
  // EQUAL_INSTALLMENTS
  const [count, setCount] = useState(
    initial?.installment_count != null ? String(initial.installment_count) : '3'
  );
  const [interval, setIntervalDays] = useState(
    initial?.installment_interval_days != null
      ? String(initial.installment_interval_days)
      : '30'
  );

  const totalMinor = majorToMinor(total);
  const depositMinor = majorToMinor(deposit);
  const balanceDaysNum = intOrNull(balanceDueDays);
  const countNum = intOrNull(count);
  const intervalNum = intOrNull(interval);

  // Client-side validity gate (mirrors the server's buildRow rules).
  const isValid = (() => {
    if (totalMinor == null || totalMinor <= 0) return false;
    if (kind === 'DEPOSIT_BALANCE') {
      if (depositMinor == null || depositMinor <= 0) return false;
      if (depositMinor >= totalMinor) return false;
      if (balanceDaysNum == null || balanceDaysNum < 1) return false;
      return true;
    }
    if (countNum == null || countNum < 2 || countNum > 12) return false;
    if (intervalNum == null || intervalNum < 1) return false;
    return true;
  })();

  // Live preview of what the student is charged.
  const preview = (() => {
    if (!isValid || totalMinor == null) return null;
    if (kind === 'DEPOSIT_BALANCE' && depositMinor != null) {
      const balance = totalMinor - depositMinor;
      return `Student pays ${formatMoney(currency, depositMinor)} now, then ${formatMoney(
        currency,
        balance
      )} due ${balanceDaysNum} day${balanceDaysNum === 1 ? '' : 's'} after enrolling.`;
    }
    if (kind === 'EQUAL_INSTALLMENTS' && countNum != null && intervalNum != null) {
      const { first, rest } = installmentSplit(totalMinor, countNum);
      const tail =
        first === rest
          ? `${countNum} payments of ${formatMoney(currency, rest)}`
          : `${formatMoney(currency, first)} now, then ${countNum - 1} × ${formatMoney(
              currency,
              rest
            )}`;
      return `Student pays ${tail}, every ${intervalNum} day${
        intervalNum === 1 ? '' : 's'
      }.`;
    }
    return null;
  })();

  const isDirty = (() => {
    if (isEdit && initial) {
      return (
        label !== (initial.label ?? '') ||
        totalMinor !== initial.total_price_minor ||
        (kind === 'DEPOSIT_BALANCE' &&
          (depositMinor !== initial.initial_price_minor ||
            balanceDaysNum !== initial.balance_due_days_after_enrolment)) ||
        (kind === 'EQUAL_INSTALLMENTS' &&
          (countNum !== initial.installment_count ||
            intervalNum !== initial.installment_interval_days))
      );
    }
    return true; // create mode: always treat as dirty
  })();

  function attemptClose() {
    if (isPending) return;
    if (isDirty) setShowDiscard(true);
    else props.onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') attemptClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, isPending]);

  function handleSubmit() {
    if (!isValid || totalMinor == null) {
      setError('Check the highlighted fields.');
      return;
    }
    setError(null);
    const values: StrategyFormValues = {
      kind,
      label: label.trim() || null,
      total_price_minor: totalMinor,
      deposit_minor: kind === 'DEPOSIT_BALANCE' ? depositMinor : null,
      balance_due_days_after_enrolment:
        kind === 'DEPOSIT_BALANCE' ? balanceDaysNum : null,
      installment_count: kind === 'EQUAL_INSTALLMENTS' ? countNum : null,
      installment_interval_days: kind === 'EQUAL_INSTALLMENTS' ? intervalNum : null,
    };
    startTransition(async () => {
      const result = isEdit
        ? await editStrategyAction(props.strategy.strategy_id, values)
        : await createStrategyAction(props.programmeId, values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      props.onClose();
      router.refresh();
    });
  }

  const kindLabel =
    kind === 'DEPOSIT_BALANCE' ? 'Deposit + balance' : 'Equal installments';
  const modalTitle = isEdit ? `Edit ${kindLabel.toLowerCase()}` : `New ${kindLabel.toLowerCase()} plan`;
  const submitLabel = isPending
    ? 'Saving…'
    : isEdit
      ? 'Save changes'
      : 'Add plan';

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={modalTitle}
        onClick={(e) => {
          if (e.target === e.currentTarget) attemptClose();
        }}
      >
        <div className="prog-modal">
          <header className="prog-modal-header">
            <h2 className="prog-modal-title">{modalTitle}</h2>
            <button
              type="button"
              className="prog-modal-close"
              aria-label="Close"
              onClick={attemptClose}
              disabled={isPending}
            >
              ✕
            </button>
          </header>

          <div className="prog-modal-body">
            <section className="prog-form-section">
              <label className="prog-field">
                <span className="prog-field-label">Plan name</span>
                <input
                  type="text"
                  className="prog-input"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={kindLabel}
                  disabled={isPending}
                  autoFocus
                />
                <span className="prog-field-help">
                  Optional. Shown to students at checkout — e.g.
                  &ldquo;Pay in 3&rdquo; or &ldquo;Founding-cohort plan&rdquo;.
                  Blank uses &ldquo;{kindLabel}&rdquo;.
                </span>
              </label>

              <label className="prog-field">
                <span className="prog-field-label">
                  Total price ({currency}) <span className="prog-required">*</span>
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  className="prog-input"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  disabled={isPending}
                />
                <span className="prog-field-help">
                  What the student pays in total under this plan. Defaults
                  to the programme&apos;s full price ({formatMoney(currency, programmePriceMinor)});
                  raise it if this plan carries a surcharge.
                </span>
              </label>

              {kind === 'DEPOSIT_BALANCE' && (
                <div className="prog-field-row">
                  <label className="prog-field">
                    <span className="prog-field-label">
                      Deposit ({currency}) <span className="prog-required">*</span>
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      className="prog-input"
                      value={deposit}
                      onChange={(e) => setDeposit(e.target.value)}
                      disabled={isPending}
                    />
                    <span className="prog-field-help">
                      Paid at checkout to secure the seat. Must be less than
                      the total.
                    </span>
                  </label>

                  <label className="prog-field">
                    <span className="prog-field-label">
                      Balance due (days) <span className="prog-required">*</span>
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      className="prog-input"
                      value={balanceDueDays}
                      onChange={(e) => setBalanceDueDays(e.target.value)}
                      disabled={isPending}
                    />
                    <span className="prog-field-help">
                      Days after enrolment the balance is due. Each
                      student&apos;s date is counted from when they enrol.
                    </span>
                  </label>
                </div>
              )}

              {kind === 'EQUAL_INSTALLMENTS' && (
                <div className="prog-field-row">
                  <label className="prog-field">
                    <span className="prog-field-label">
                      Number of payments <span className="prog-required">*</span>
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={2}
                      max={12}
                      className="prog-input"
                      value={count}
                      onChange={(e) => setCount(e.target.value)}
                      disabled={isPending}
                    />
                    <span className="prog-field-help">Between 2 and 12.</span>
                  </label>

                  <label className="prog-field">
                    <span className="prog-field-label">
                      Days apart <span className="prog-required">*</span>
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      className="prog-input"
                      value={interval}
                      onChange={(e) => setIntervalDays(e.target.value)}
                      disabled={isPending}
                    />
                    <span className="prog-field-help">
                      e.g. 30 for monthly. Counted from each student&apos;s
                      enrolment date.
                    </span>
                  </label>
                </div>
              )}

              {preview && <p className="pp-preview">{preview}</p>}
            </section>
          </div>

          <footer className="prog-modal-footer">
            <button
              type="button"
              className="prog-btn prog-btn-ghost"
              onClick={attemptClose}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="prog-btn prog-btn-primary"
              onClick={handleSubmit}
              disabled={!isValid || isPending || (isEdit && !isDirty)}
            >
              {submitLabel}
            </button>
          </footer>
        </div>
      </div>

      <ErrorToast error={error} onDismiss={() => setError(null)} />

      {showDiscard && (
        <DiscardConfirm
          onKeepEditing={() => setShowDiscard(false)}
          onDiscard={() => {
            setShowDiscard(false);
            props.onClose();
          }}
        />
      )}
    </>
  );
}
