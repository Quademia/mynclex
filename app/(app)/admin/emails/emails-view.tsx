'use client';

// mynclex/app/(app)/admin/emails/emails-view.tsx
//
// The screen half of the email monitor. Two tables: what needs a person,
// and what recently went.
//
// Toasts rather than inline banners, per the UI convention — an inline
// message at the top of a scrolling table is invisible the moment you
// scroll past it.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { OutboxRow } from '@/lib/email/types';
import { retryEmailAction } from './actions';

type Props = {
  stuck: OutboxRow[];
  sent: OutboxRow[];
  /** Resend message id → their last_event, when we could reach them. */
  delivery: Record<string, string>;
};

/** How each state reads to a person, and how loud it should look. */
const STATUS_META: Record<string, { label: string; tone: string }> = {
  DEAD: { label: 'Gave up', tone: 'bad' },
  FAILED: { label: 'Retrying', tone: 'warn' },
  EXPIRED: { label: 'Too late to send', tone: 'muted' },
  QUEUED: { label: 'Waiting', tone: 'muted' },
  SENT: { label: 'Handed over', tone: 'ok' },
};

/**
 * ⚠ Resend's word, translated — and the distinction matters. Our SENT
 * means we handed it over. Only these say what happened next.
 */
const DELIVERY_META: Record<string, { label: string; tone: string }> = {
  delivered: { label: 'Delivered', tone: 'ok' },
  opened: { label: 'Opened', tone: 'ok' },
  clicked: { label: 'Opened', tone: 'ok' },
  bounced: { label: 'Bounced', tone: 'bad' },
  complained: { label: 'Marked as spam', tone: 'bad' },
  delivery_delayed: { label: 'Delayed', tone: 'warn' },
  suppressed: { label: 'Suppressed', tone: 'bad' },
  sent: { label: 'In flight', tone: 'muted' },
};

function when(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EmailsView({ stuck, sent, delivery }: Props) {
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function retry(row: OutboxRow) {
    setBusyId(row.email_id);
    startTransition(async () => {
      const r = await retryEmailAction(row.email_id);
      setBusyId(null);
      setToast(
        r.ok
          ? { text: 'Sent.', tone: 'ok' }
          : { text: r.error ?? 'Still failing.', tone: 'bad' }
      );
      setTimeout(() => setToast(null), 5000);
    });
  }

  const deadCount = stuck.filter((r) => r.status === 'DEAD').length;

  return (
    <>
      {toast && (
        <div className={`eml-toast eml-toast-${toast.tone}`} role="status">
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <header className="eml-head">
        <div>
          <p className="eml-eyebrow">Communications</p>
          <h1 className="eml-title">Emails</h1>
          <p className="eml-sub">
            Every email the app composes passes through a queue. This is what is stuck in it.
          </p>
        </div>
        <Link href="/admin/emails/preview" className="eml-btn-ghost">
          Preview templates
        </Link>
      </header>

      <section className="eml-section">
        <div className="eml-section-head">
          <h2 className="eml-h2">Needs attention</h2>
          {deadCount > 0 && <span className="eml-pill eml-pill-bad">{deadCount} gave up</span>}
        </div>

        {stuck.length === 0 ? (
          <p className="eml-empty">
            Nothing stuck. Every email that was owed has gone.
            {/* ⚠ Deliberately not "everything is fine" — this page can
                only speak for emails that were queued. */}
          </p>
        ) : (
          <div className="eml-table-wrap">
            <table className="eml-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>To</th>
                  <th>State</th>
                  <th>Why</th>
                  <th>Tries</th>
                  <th>Last tried</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {stuck.map((row) => {
                  const meta = STATUS_META[row.status] ?? { label: row.status, tone: 'muted' };
                  return (
                    <tr key={row.email_id}>
                      <td>
                        <span className="eml-key">{row.event_key}</span>
                        {row.stage !== '-' && <span className="eml-stage">{row.stage}</span>}
                      </td>
                      <td className="eml-to">{row.to_email}</td>
                      <td>
                        <span className={`eml-pill eml-pill-${meta.tone}`}>{meta.label}</span>
                      </td>
                      <td className="eml-why">
                        {row.last_error_message ?? '—'}
                        {row.last_error_code && (
                          <code className="eml-code">{row.last_error_code}</code>
                        )}
                      </td>
                      <td>{row.attempts}</td>
                      <td className="eml-when">{when(row.last_attempt_at)}</td>
                      <td>
                        {row.status !== 'QUEUED' && (
                          <button
                            type="button"
                            className="eml-btn"
                            disabled={busyId === row.email_id}
                            onClick={() => retry(row)}
                          >
                            {busyId === row.email_id ? 'Sending…' : 'Retry'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="eml-section">
        <h2 className="eml-h2">Recently sent</h2>
        <p className="eml-note">
          <strong>Handed over</strong> means Resend accepted it. The delivery column is their
          answer to what happened next.
        </p>

        {sent.length === 0 ? (
          <p className="eml-empty">Nothing sent yet.</p>
        ) : (
          <div className="eml-table-wrap">
            <table className="eml-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>To</th>
                  <th>Subject</th>
                  <th>Sent</th>
                  <th>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {sent.map((row) => {
                  const ev = row.provider_message_id ? delivery[row.provider_message_id] : undefined;
                  const dm = ev ? DELIVERY_META[ev] ?? { label: ev, tone: 'muted' } : null;
                  return (
                    <tr key={row.email_id}>
                      <td>
                        <span className="eml-key">{row.event_key}</span>
                        {row.stage !== '-' && <span className="eml-stage">{row.stage}</span>}
                      </td>
                      <td className="eml-to">{row.to_email}</td>
                      <td className="eml-subject">{row.rendered_subject ?? '—'}</td>
                      <td className="eml-when">{when(row.sent_at)}</td>
                      <td>
                        {dm ? (
                          <span className={`eml-pill eml-pill-${dm.tone}`}>{dm.label}</span>
                        ) : (
                          <span className="eml-pill eml-pill-muted">Handed over</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
