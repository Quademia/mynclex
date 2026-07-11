// mynclex/lib/audit/history-drawer.tsx
//
// The shared, reusable History affordance for the authorship feature.
// A small clock button that, on click, lazy-loads one entity's full
// append-only timeline (timeline-actions.ts) and shows it in a drawer.
//
// The drawer is PORTALED to document.body and fixed-position, so it
// floats above whatever mounted the trigger — a list row, a modal-
// hosted question editor, an embedded wrapper editor, or a wrapper
// topbar — all identically. That is what lets the same component serve
// every surface: the trigger never has to know its host (the same
// lesson as the programmes-modal stacking-context fix).

'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { loadAuditTimeline, type TimelineEntry } from './timeline-actions';
import type { AuditRealm } from './authorship';

interface HistoryButtonProps {
  realm:      AuditRealm;
  entityType: string;
  entityId:   string;
  /** Shown in the drawer header so the curator knows what they opened. */
  title:      string;
}

export function HistoryButton({ realm, entityType, entityId, title }: HistoryButtonProps) {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [error, setError]     = useState<string | null>(null);

  async function openDrawer() {
    setOpen(true);
    if (entries !== null || loading) return; // already loaded / loading
    setLoading(true);
    setError(null);
    try {
      setEntries(await loadAuditTimeline(realm, entityType, entityId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load history.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="audit-history-btn"
        onClick={openDrawer}
        title="View change history"
        aria-label="View change history"
      >
        <span aria-hidden="true">🕑</span>
      </button>
      {open && (
        <HistoryDrawer
          title={title}
          entries={entries}
          loading={loading}
          error={error}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface HistoryDrawerProps {
  title:    string;
  entries:  TimelineEntry[] | null;
  loading:  boolean;
  error:    string | null;
  onClose:  () => void;
}

/**
 * The bare drawer chrome — overlay + panel + header + scrollable body —
 * exported so surfaces with richer timelines (the readiness-pack
 * history, whose entries merge two entity types) reuse the shell and
 * only supply their own rows. The bank HistoryDrawer below is the
 * reference consumer.
 */
export function AuditDrawerShell({
  title,
  onClose,
  children,
}: {
  title:    string;
  onClose:  () => void;
  children: ReactNode;
}) {
  // Escape closes, matching the modal-frame convention.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The drawer only ever renders after a client-side click (open state
  // starts false), so document is always available here — no mount
  // guard needed. Belt-and-braces SSR check keeps createPortal safe.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="audit-drawer-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className="audit-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Change history — ${title}`}
      >
        <header className="audit-drawer-header">
          <div>
            <p className="audit-drawer-eyebrow">Change history</p>
            <h2 className="audit-drawer-title">{title}</h2>
          </div>
          <button
            type="button"
            className="audit-drawer-close"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="audit-drawer-body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

function HistoryDrawer({ title, entries, loading, error, onClose }: HistoryDrawerProps) {
  return (
    <AuditDrawerShell title={title} onClose={onClose}>
      {loading && <p className="audit-drawer-muted">Loading history…</p>}

      {error && <p className="audit-drawer-error">{error}</p>}

      {!loading && !error && entries && entries.length === 0 && (
        <p className="audit-drawer-muted">
          No recorded history yet. Authorship is captured from each
          future edit onward — items created before tracking show
          nothing here until they&apos;re next saved.
        </p>
      )}

      {!loading && !error && entries && entries.length > 0 && (
        <ol className="audit-timeline">
          {entries.map((e, i) => (
            <li key={i} className="audit-timeline-row">
              <span
                className={
                  e.action === 'created'
                    ? 'audit-timeline-pip created'
                    : 'audit-timeline-pip updated'
                }
                aria-hidden="true"
              />
              <div className="audit-timeline-text">
                <span className="audit-timeline-action">
                  {e.action === 'created' ? 'Created' : 'Edited'}
                  {' by '}
                  <strong>{e.changedByName ?? 'System'}</strong>
                </span>
                <span className="audit-timeline-when">{formatWhen(e.changedAt)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </AuditDrawerShell>
  );
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year:   'numeric',
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}
