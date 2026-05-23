// mynclex/app/(app)/tutor/programme/[programme_id]/enquiries/enquiries-panel.tsx
//
// Tutor enquiry queue UI (Slice 8b, rebuilt). Inbox-style split view:
// scannable one-line rows on the left, full detail of the selected lead
// on the right. Filter chips bar above the split.
//
// Why this shape: the surface is a *queue* — the tutor wants to glance
// across many leads quickly, then drill into one. Stacked cards forced
// reading each card top-to-bottom and surfaced edit fields (notes,
// actions) on every row at once. The split keeps the list dense and
// scannable, and the detail pane is where the tutor actually does work.
//
// Selection is plain client state — the first lead in the active filter
// is selected on load and whenever the filter changes if the previous
// pick falls out of view. Empty detail when nothing matches.
//
// Notes textarea now lives only in the detail pane — not visible until
// the tutor has picked a lead to act on.

'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import {
  markContactedAction,
  markClosedAction,
  saveAdminNotesAction,
} from '@/lib/enquiries/actions';
import {
  channelLabel,
  formatEnquiryDateTime,
  statusPill,
} from '@/lib/enquiries/format';
import type { Enquiry, EnquiryStatus } from '@/lib/enquiries/types';

type FilterKey = 'OPEN' | 'NEW' | 'CONTACTED' | 'CONVERTED' | 'CLOSED' | 'ALL';

// "Open" = NEW + CONTACTED; the natural "still needs my attention" view.
const OPEN_STATUSES: ReadonlySet<EnquiryStatus> = new Set(['NEW', 'CONTACTED']);

function matchesFilter(e: Enquiry, filter: FilterKey): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'OPEN') return OPEN_STATUSES.has(e.status);
  return e.status === filter;
}

// Relative time for fresh leads, absolute for older. Tutors mostly care
// about "is this recent?" — anything > a week reads better as a date.
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

// Compact channel chip — full labels eat space, so first letter only on
// the list rows. Detail pane shows the full label.
function channelInitial(ch: string): string {
  switch (ch) {
    case 'WHATSAPP': return 'W';
    case 'CALL':     return 'C';
    case 'SMS':      return 'S';
    case 'EMAIL':    return 'E';
    default:         return '?';
  }
}

export function EnquiriesPanel({
  programmeId,
  enquiries,
}: {
  programmeId: string;
  enquiries: Enquiry[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>('OPEN');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, startTransition] = useTransition();

  const counts = useMemo(() => {
    let nNew = 0, nContacted = 0, nConv = 0, nClosed = 0;
    for (const e of enquiries) {
      if (e.status === 'NEW') nNew++;
      else if (e.status === 'CONTACTED') nContacted++;
      else if (e.status === 'CONVERTED') nConv++;
      else nClosed++;
    }
    return {
      all: enquiries.length,
      open: nNew + nContacted,
      NEW: nNew,
      CONTACTED: nContacted,
      CONVERTED: nConv,
      CLOSED: nClosed,
    };
  }, [enquiries]);

  const shown = useMemo(
    () => enquiries.filter((e) => matchesFilter(e, filter)),
    [enquiries, filter],
  );

  // Keep selection sensible:
  //   • If selected is gone from the filtered list, jump to first row.
  //   • If nothing was selected yet, pick first row (or null when empty).
  useEffect(() => {
    if (shown.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !shown.some((e) => e.enquiry_id === selectedId)) {
      setSelectedId(shown[0].enquiry_id);
    }
  }, [shown, selectedId]);

  const selected = useMemo(
    () => enquiries.find((e) => e.enquiry_id === selectedId) ?? null,
    [enquiries, selectedId],
  );

  function runAction(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
  ) {
    if (actionPending) return;
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const chips: { key: FilterKey; label: string; count: number }[] = [
    { key: 'OPEN',      label: 'Open',      count: counts.open      },
    { key: 'NEW',       label: 'New',       count: counts.NEW       },
    { key: 'CONTACTED', label: 'Contacted', count: counts.CONTACTED },
    { key: 'CONVERTED', label: 'Converted', count: counts.CONVERTED },
    { key: 'CLOSED',    label: 'Closed',    count: counts.CLOSED    },
    { key: 'ALL',       label: 'All',       count: counts.all       },
  ];

  return (
    <div className="enq-shell">
      <div className="enq-filters">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`enq-chip${filter === c.key ? ' on' : ''}`}
            onClick={() => setFilter(c.key)}
          >
            {c.label} <span className="enq-chip-count">{c.count}</span>
          </button>
        ))}
      </div>

      <div className="enq-split">
        <aside className="enq-list-col" aria-label="Enquiry list">
          {shown.length === 0 ? (
            <p className="enq-empty">
              {enquiries.length === 0
                ? "No enquiries yet. They'll appear here when students send a message from your programme's public page."
                : 'No enquiries match this filter.'}
            </p>
          ) : (
            <ul className="enq-list">
              {shown.map((e) => (
                <EnquiryRow
                  key={e.enquiry_id}
                  enquiry={e}
                  active={e.enquiry_id === selectedId}
                  onSelect={() => setSelectedId(e.enquiry_id)}
                />
              ))}
            </ul>
          )}
        </aside>

        <section className="enq-detail-col" aria-label="Enquiry detail">
          {selected ? (
            <EnquiryDetail
              enquiry={selected}
              pending={actionPending}
              onMarkContacted={() => runAction(() => markContactedAction(selected.enquiry_id))}
              onMarkClosed={() => runAction(() => markClosedAction(selected.enquiry_id))}
              onSaveNotes={(notes) => runAction(() => saveAdminNotesAction(selected.enquiry_id, notes))}
            />
          ) : (
            <div className="enq-detail-empty">
              {enquiries.length === 0
                ? 'No enquiries to show yet.'
                : 'Select an enquiry on the left.'}
            </div>
          )}
        </section>
      </div>

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </div>
  );
}

// -------------------------------------------------------------------
// List row — single line, scannable.
// -------------------------------------------------------------------

function EnquiryRow({
  enquiry,
  active,
  onSelect,
}: {
  enquiry: Enquiry;
  active: boolean;
  onSelect: () => void;
}) {
  const pill = statusPill(enquiry.status);
  const isTerminal = enquiry.status === 'CONVERTED' || enquiry.status === 'CLOSED';
  const snippet = (enquiry.message ?? '').trim() || '(no message)';

  return (
    <li>
      <button
        type="button"
        className={`enq-row${active ? ' is-active' : ''}${isTerminal ? ' is-terminal' : ''}`}
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
      >
        <span className={`enq-row-dot enq-row-dot-${pill.tone}`} aria-hidden="true" />
        <span className="enq-row-main">
          <span className="enq-row-top">
            <span className="enq-row-name">{enquiry.name}</span>
            <span className="enq-row-when">{formatRelative(enquiry.created_at)}</span>
          </span>
          <span className="enq-row-snippet">{snippet}</span>
        </span>
        <span className="enq-row-channels" aria-label="Preferred channels">
          {enquiry.preferred_contact.map((ch) => (
            <span key={ch} className="enq-row-channel" title={channelLabel(ch)}>
              {channelInitial(ch)}
            </span>
          ))}
        </span>
      </button>
    </li>
  );
}

// -------------------------------------------------------------------
// Detail pane — full content for the selected lead.
// -------------------------------------------------------------------

function EnquiryDetail({
  enquiry,
  pending,
  onMarkContacted,
  onMarkClosed,
  onSaveNotes,
}: {
  enquiry: Enquiry;
  pending: boolean;
  onMarkContacted: () => void;
  onMarkClosed: () => void;
  onSaveNotes: (notes: string) => void;
}) {
  // Reset draft when switching to a different enquiry. Keyed by id so
  // useState seeds with the right starting value.
  const [notesDraft, setNotesDraft] = useState(enquiry.admin_notes ?? '');
  useEffect(() => {
    setNotesDraft(enquiry.admin_notes ?? '');
  }, [enquiry.enquiry_id, enquiry.admin_notes]);

  const dirty = notesDraft !== (enquiry.admin_notes ?? '');
  const pill = statusPill(enquiry.status);
  const isTerminal = enquiry.status === 'CONVERTED' || enquiry.status === 'CLOSED';

  return (
    <div className="enq-detail">
      <header className="enq-detail-head">
        <div className="enq-detail-identity">
          <h2 className="enq-detail-name">{enquiry.name}</h2>
          <span className={`enq-pill enq-pill-${pill.tone}`}>{pill.label}</span>
        </div>
        <p className="enq-detail-sent">
          Sent {formatEnquiryDateTime(enquiry.created_at)}
          {enquiry.contacted_at && (
            <> · Contacted {formatEnquiryDateTime(enquiry.contacted_at)}</>
          )}
        </p>
      </header>

      <dl className="enq-detail-meta">
        <div>
          <dt>Preferred</dt>
          <dd className="enq-detail-channels">
            {enquiry.preferred_contact.map((ch) => (
              <span key={ch} className="enq-channel-pill">{channelLabel(ch)}</span>
            ))}
          </dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>
            <a href={`mailto:${enquiry.email}`}>{enquiry.email}</a>
          </dd>
        </div>
        {enquiry.phone && (
          <div>
            <dt>Phone</dt>
            <dd>
              <a href={`tel:${enquiry.phone.replace(/\s+/g, '')}`}>{enquiry.phone}</a>
            </dd>
          </div>
        )}
      </dl>

      <div className="enq-detail-message">
        <h3 className="enq-detail-section-title">Message</h3>
        {enquiry.message ? (
          <p>{enquiry.message}</p>
        ) : (
          <p className="enq-detail-empty-inline">(No message — just contact details.)</p>
        )}
      </div>

      <div className="enq-detail-notes">
        <label>
          <h3 className="enq-detail-section-title">Your notes</h3>
          <textarea
            className="enq-notes-input"
            rows={3}
            placeholder="Private — only visible to you and admin."
            value={notesDraft}
            onChange={(ev) => setNotesDraft(ev.target.value)}
            disabled={pending}
          />
        </label>
        {dirty && (
          <button
            type="button"
            className="prog-btn prog-btn-secondary prog-btn-sm"
            onClick={() => onSaveNotes(notesDraft)}
            disabled={pending}
          >
            Save notes
          </button>
        )}
      </div>

      <footer className="enq-detail-actions">
        {enquiry.status === 'NEW' && (
          <button
            type="button"
            className="prog-btn prog-btn-primary prog-btn-sm"
            onClick={onMarkContacted}
            disabled={pending}
          >
            Mark as contacted
          </button>
        )}
        {!isTerminal && (
          <button
            type="button"
            className="prog-btn prog-btn-ghost prog-btn-sm"
            onClick={onMarkClosed}
            disabled={pending}
          >
            Close
          </button>
        )}
      </footer>
    </div>
  );
}
