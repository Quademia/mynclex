// mynclex/lib/enrolments/payment-history-drawer.tsx
//
// Per-student payment history (2026-06-12) — the read-only drawer behind
// the roster's payment pill. Mirrors the audit history-drawer pattern
// (lib/audit/history-drawer.tsx): PORTALED to document.body and
// fixed-position, so it floats above the roster identically from either
// mount (cohort or programme scope). History = readout → drawer; the
// roster's decision dialogs (Mark paid, Give more time) stay modals.
//
// Keyed by enrolment_id (+ the payer's name/email for the header), so
// it's caller-agnostic: the roster opens it from a row, and the global
// tutor Payments page opens it from the 🕑 in a payment's Purpose cell
// (Slice 2). getPaymentHistoryAction gates ownership server-side.

'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatMoney } from '@/lib/strategies/format';
import {
  getPaymentHistoryAction,
  type PaymentHistoryView,
} from './actions';

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function PaymentHistoryDrawer({
  enrolmentId,
  name,
  email,
  onClose,
}: {
  enrolmentId: string;
  name: string;
  email: string;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<PaymentHistoryView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getPaymentHistoryAction(enrolmentId).then((res) => {
      if (!alive) return;
      if (res.ok) setHistory(res.history);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [enrolmentId]);

  // Escape closes, matching the modal-frame convention.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pmh-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className="pmh-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Payment history — ${name}`}
      >
        <header className="pmh-header">
          <div>
            <p className="pmh-eyebrow">Payment history</p>
            <h2 className="pmh-title">{name}</h2>
            <p className="pmh-sub">{email}</p>
          </div>
          <button
            type="button"
            className="pmh-close"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="pmh-body">
          {!history && !error && <p className="pmh-muted">Loading history…</p>}
          {error && <p className="pmh-error">{error}</p>}

          {history && (
            <>
              <div className="pmh-summary">
                <div className="pmh-plan">
                  {history.planName} ·{' '}
                  {formatMoney(history.currency, history.totalMinor)}
                </div>
                <div className="pmh-totals">
                  <span>
                    <strong>
                      {history.paidCount} of {history.totalPayments}
                    </strong>{' '}
                    paid
                  </span>
                  <span>
                    <strong>
                      {formatMoney(history.currency, history.receivedMinor)}
                    </strong>{' '}
                    received
                  </span>
                  <span>
                    <strong>
                      {formatMoney(history.currency, history.remainingMinor)}
                    </strong>{' '}
                    remaining
                  </span>
                </div>
                <div className="pmh-enrolled">
                  Enrolled {formatDay(history.enrolledAtIso)}
                </div>
              </div>

              <ol className="pmh-list">
                {history.items.map((item) => (
                  <li
                    key={item.index}
                    className={`pmh-item is-${item.state.toLowerCase()}${
                      item.isOverdue ? ' is-overdue' : ''
                    }`}
                  >
                    <span className="pmh-pip" aria-hidden="true">
                      {item.state === 'PAID' ? '✓' : item.index}
                    </span>
                    <div className="pmh-item-main">
                      <div className="pmh-item-top">
                        <span className="pmh-item-label">
                          Payment {item.index} of {history.totalPayments}
                        </span>
                        <span className="pmh-item-amount">
                          {formatMoney(history.currency, item.amountMinor)}
                        </span>
                      </div>
                      <div className="pmh-item-detail">
                        {item.state === 'PAID' ? (
                          <>
                            Paid {item.paidAtIso ? formatDay(item.paidAtIso) : ''} ·{' '}
                            {item.channel === 'OFF_PLATFORM'
                              ? 'off-platform — marked received by you'
                              : 'online via Paystack (Quademia)'}
                          </>
                        ) : item.state === 'DUE' ? (
                          item.graceUntilIso ? (
                            <>
                              Was due {formatDay(item.dueDateIso)} — extended to{' '}
                              {formatDay(item.graceUntilIso)}
                            </>
                          ) : item.isOverdue ? (
                            <>Overdue — was due {formatDay(item.dueDateIso)}</>
                          ) : (
                            <>Due {formatDay(item.dueDateIso)}</>
                          )
                        ) : (
                          <>Upcoming · due {formatDay(item.dueDateIso)}</>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>

              {history.graceHistory.length > 0 && (
                <div className="pmh-section">
                  <h3 className="pmh-section-title">Extensions granted</h3>
                  <ul className="pmh-grace-list">
                    {history.graceHistory.map((g, i) => (
                      <li key={i}>
                        {formatDay(g.grantedAtIso)} — gave {g.days} day
                        {g.days === 1 ? '' : 's'} (until {formatDay(g.graceUntilIso)})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {history.refunded.length > 0 && (
                <div className="pmh-section">
                  <h3 className="pmh-section-title">Refunded</h3>
                  <ul className="pmh-grace-list">
                    {history.refunded.map((r, i) => (
                      <li key={i}>
                        {formatMoney(history.currency, r.amountMinor)}
                        {r.whenIso ? ` — originally paid ${formatDay(r.whenIso)}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
