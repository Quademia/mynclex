// mynclex/app/(app)/admin/enquiries/admin-enquiries-board.tsx
//
// Admin cross-programme enquiry list (Slice 8c). Read-only; filter chips
// at the top, table-like rows below. Status changes belong on the tutor
// surface — each row has an "Open ↗" link that hops the admin to that
// programme's tutor enquiries page (the tutor's own page is accessible
// to the admin via the SUPER_ADMIN bypass on the same RLS that scopes
// non-admin tutors to their own programmes).
//
// Style reuses the .enq-* family from the tutor surface for consistency
// in pills + channel chips, plus a tiny admin-only table shell.

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ContactChannel } from '@/lib/discovery/contact-options';
import { channelLabel, formatEnquiryDateTime, statusPill } from '@/lib/enquiries/format';
import type { EnquiryStatus } from '@/lib/enquiries/types';

export type AdminEnquiryRow = {
  enquiry_id: string;
  programme_id: string;
  programme_title: string;
  tutor_name: string | null;
  name: string;
  email: string;
  phone: string | null;
  preferred_contact: ContactChannel[];
  message: string | null;
  status: EnquiryStatus;
  contacted_at: string | null;
  converted_enrolment_id: string | null;
  admin_notes: string | null;
  created_at: string;
};

type FilterKey = 'OPEN' | 'NEW' | 'CONTACTED' | 'CONVERTED' | 'CLOSED' | 'ALL';

const OPEN_STATUSES: ReadonlySet<EnquiryStatus> = new Set(['NEW', 'CONTACTED']);

function matchesFilter(r: AdminEnquiryRow, filter: FilterKey): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'OPEN') return OPEN_STATUSES.has(r.status);
  return r.status === filter;
}

export function AdminEnquiriesBoard({ rows }: { rows: AdminEnquiryRow[] }) {
  const [filter, setFilter] = useState<FilterKey>('OPEN');
  const [programmeFilter, setProgrammeFilter] = useState<string>('ALL');

  const counts = useMemo(() => {
    let nNew = 0, nCon = 0, nConv = 0, nClosed = 0;
    for (const r of rows) {
      if (r.status === 'NEW') nNew++;
      else if (r.status === 'CONTACTED') nCon++;
      else if (r.status === 'CONVERTED') nConv++;
      else nClosed++;
    }
    return {
      all: rows.length,
      open: nNew + nCon,
      NEW: nNew, CONTACTED: nCon, CONVERTED: nConv, CLOSED: nClosed,
    };
  }, [rows]);

  // Programme dropdown options — distinct programmes present in the data.
  const programmeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (!seen.has(r.programme_id)) seen.set(r.programme_id, r.programme_title);
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          matchesFilter(r, filter) &&
          (programmeFilter === 'ALL' || r.programme_id === programmeFilter),
      ),
    [rows, filter, programmeFilter],
  );

  const chips: { key: FilterKey; label: string; count: number }[] = [
    { key: 'OPEN',      label: 'Open',      count: counts.open      },
    { key: 'NEW',       label: 'New',       count: counts.NEW       },
    { key: 'CONTACTED', label: 'Contacted', count: counts.CONTACTED },
    { key: 'CONVERTED', label: 'Converted', count: counts.CONVERTED },
    { key: 'CLOSED',    label: 'Closed',    count: counts.CLOSED    },
    { key: 'ALL',       label: 'All',       count: counts.all       },
  ];

  return (
    <section className="enq-shell">
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

        {programmeOptions.length > 1 && (
          <select
            className="enq-prog-filter"
            value={programmeFilter}
            onChange={(e) => setProgrammeFilter(e.target.value)}
            aria-label="Filter by programme"
          >
            <option value="ALL">All programmes</option>
            {programmeOptions.map(([id, title]) => (
              <option key={id} value={id}>{title}</option>
            ))}
          </select>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="enq-empty">
          {rows.length === 0
            ? 'No enquiries have been submitted yet.'
            : 'No enquiries match these filters.'}
        </p>
      ) : (
        <ul className="enq-admin-list">
          {shown.map((r) => (
            <AdminRow key={r.enquiry_id} row={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AdminRow({ row }: { row: AdminEnquiryRow }) {
  const pill = statusPill(row.status);
  const tutorHref = `/tutor/programme/${row.programme_id}/enquiries`;

  return (
    <li className="enq-admin-row">
      <header className="enq-admin-row-head">
        <span className={`enq-pill enq-pill-${pill.tone}`}>{pill.label}</span>
        <span className="enq-admin-prog">
          {row.programme_title}
          {row.tutor_name && (
            <span className="enq-admin-tutor"> · {row.tutor_name}</span>
          )}
        </span>
        <span className="enq-admin-when">
          {formatEnquiryDateTime(row.created_at)}
        </span>
      </header>

      <div className="enq-admin-body">
        <div className="enq-admin-identity">
          <span className="enq-admin-name">{row.name}</span>
          <a className="enq-admin-contact" href={`mailto:${row.email}`}>{row.email}</a>
          {row.phone && (
            <a className="enq-admin-contact" href={`tel:${row.phone.replace(/\s+/g, '')}`}>
              {row.phone}
            </a>
          )}
        </div>
        <div className="enq-admin-channels">
          {row.preferred_contact.map((ch) => (
            <span key={ch} className="enq-channel-pill">{channelLabel(ch)}</span>
          ))}
        </div>
      </div>

      {row.message && (
        <p className="enq-admin-message">{row.message}</p>
      )}

      <footer className="enq-admin-actions">
        <Link className="enq-admin-link" href={tutorHref}>
          Open in tutor view ↗
        </Link>
      </footer>
    </li>
  );
}
