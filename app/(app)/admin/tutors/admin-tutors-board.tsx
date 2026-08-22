// mynclex/app/(app)/admin/tutors/admin-tutors-board.tsx
//
// Client half of the tutor directory (sub-slice 1b). Single-use, so it
// lives next to its only caller per the folder convention.
//
// Filtering is client-side over the loaded rows: this page sees five rows
// on dev and one on prod, and the plan doc's whole point is that §4.4
// ("every doorway writes a row") makes the directory ONE query. Adding
// round trips to filter six rows would undo that.
//
// The drawer is a drawer and not a /admin/tutors/[id] route on purpose:
// the record is small — a tutor "currently is very little that a user
// isn't, a bio and a standing" (§2) — and the admin's job here is
// scanning several, not dwelling on one.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { AddTutorModal } from './add-tutor-modal';
import { SuspendModal } from './suspend-modal';
import { ReinstateModal } from './reinstate-modal';
import { TutorRecordDrawer, StatusPill } from '@/lib/tutors/record-drawer';
import {
  hasPublicProfile,
  sourceClass,
  sourceLabel,
  type TutorDirectoryStats,
  type TutorRecord,
} from '@/lib/tutors/types';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The profile cell's two lines, or the "not filled in" state. */
function profileLines(row: TutorRecord): { main: string; sub: string } {
  if (!hasPublicProfile(row.profile)) {
    // A first-class row state, not an empty cell: a promoted or invited
    // tutor has a standing and no bio, and that gap is the admin's next
    // nudge. It is why 1b lists this as a column at all.
    return {
      main: 'Profile not filled in yet',
      sub: 'No headline, speciality or bio',
    };
  }
  const bits: string[] = [];
  if (row.profile.speciality) bits.push(row.profile.speciality);
  if (row.profile.years_experience) {
    bits.push(`${row.profile.years_experience} years tutoring`);
  }
  return {
    main: row.profile.headline ?? '',
    sub: bits.join(' · ') || '—',
  };
}

export function AdminTutorsBoard({
  rows,
  stats,
}: {
  rows: TutorRecord[];
  stats: TutorDirectoryStats;
}) {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'APPROVED' | 'SUSPENDED'>('ALL');
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** user_id whose suspend / reinstate modal is open, or null. */
  const [suspending, setSuspending] = useState<string | null>(null);
  const [reinstating, setReinstating] = useState<string | null>(null);

  // Auto-dismiss at ~5s, the house convention for every toast in the app.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        r.email.toLowerCase().includes(needle) ||
        (r.profile.headline ?? '').toLowerCase().includes(needle)
      );
    });
  }, [rows, q, statusFilter]);

  const open = drawerId ? (rows.find((r) => r.user_id === drawerId) ?? null) : null;
  const suspendRow = suspending ? (rows.find((r) => r.user_id === suspending) ?? null) : null;
  const reinstateRow = reinstating ? (rows.find((r) => r.user_id === reinstating) ?? null) : null;

  return (
    <>
      <div className="adt-head-row">
        <header className="ao-page-head">
          <h1 className="ao-page-title">Tutors</h1>
          <p className="ao-page-sub">
            Everyone who has ever been made, or asked to be, a tutor — with
            the standing they are in and who let them in. Tutors write their
            own public profile; this page does not edit it.
          </p>
        </header>
        <div className="adt-head-actions">
          <button type="button" className="btn btn-accent" onClick={() => setAddOpen(true)}>
            + Add tutor
          </button>
        </div>
      </div>

      <div className="adt-stats">
        <div className="ao-kpi-card">
          <div className="ao-kpi-label">Approved</div>
          <div className="ao-kpi-value">{stats.approved}</div>
          <div className="adt-stat-sub">Hold the TUTOR role · listed in the catalogue</div>
        </div>
        <div className="ao-kpi-card">
          <div className="ao-kpi-label">Pending applications</div>
          <div className="ao-kpi-value">{stats.pending}</div>
          <a className="adt-stat-link" href="/admin/applications">
            Review the queue →
          </a>
        </div>
        <div className="ao-kpi-card">
          <div className="ao-kpi-label">Suspended</div>
          {/* Red only when non-zero — a permanent red zero reads as a
              fault rather than a clean slate. */}
          <div className={`ao-kpi-value${stats.suspended > 0 ? ' is-danger' : ''}`}>
            {stats.suspended}
          </div>
          <div className="adt-stat-sub">Role revoked · existing students keep materials</div>
        </div>
      </div>

      <div className="adt-toolbar">
        <input
          className="adt-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, headline…"
          aria-label="Search tutors"
        />
        <select
          className="ao-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          aria-label="Filter by status"
        >
          <option value="ALL">All statuses</option>
          <option value="APPROVED">Approved</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <span className="ao-table-count">{shown.length} shown</span>
      </div>

      <div className="adt-table-scroll">
        <div className="ao-table">
          <div className="ao-table-row head adt-cols">
            <span>Tutor</span>
            <span>Public profile</span>
            <span>Source</span>
            <span>Progr.</span>
            <span>First approved</span>
            <span>Status</span>
            <span className="ao-th-actions">Actions</span>
          </div>

          {shown.length === 0 ? (
            <div className="ao-table-empty">No tutors match this filter.</div>
          ) : (
            shown.map((r) => (
              <TutorRow key={r.user_id} row={r} onOpen={() => setDrawerId(r.user_id)} />
            ))
          )}
        </div>
      </div>

      {open && (
        <TutorRecordDrawer
          row={open}
          onClose={() => setDrawerId(null)}
          actions={
            <>
              {/* One button, never both: the only two standings this page
                  can act on are APPROVED and SUSPENDED, and each has
                  exactly one move. A PENDING or REJECTED row belongs to
                  the applications queue (2b), so it gets neither.
                  ⚠ Both only OPEN a dialog; neither acts. Reinstate used
                  to fire on click, per the design — it gained a confirm
                  step because it sits beside Close and, since 1d-i, a
                  stray click leaves a permanent trail entry. */}
              {open.status === 'SUSPENDED' && (
                <button
                  type="button"
                  className="btn btn-accent btn-sm"
                  onClick={() => setReinstating(open.user_id)}
                >
                  Reinstate…
                </button>
              )}
              {open.status === 'APPROVED' && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setSuspending(open.user_id)}
                >
                  Suspend…
                </button>
              )}
            </>
          }
        />
      )}

      {reinstateRow && (
        <ReinstateModal
          userId={reinstateRow.user_id}
          name={reinstateRow.name}
          onClose={() => setReinstating(null)}
          onDone={(message) => {
            setReinstating(null);
            setToast(message);
          }}
        />
      )}

      {suspending && suspendRow && (
        <SuspendModal
          userId={suspendRow.user_id}
          name={suspendRow.name}
          onClose={() => setSuspending(null)}
          onDone={(message) => {
            setSuspending(null);
            setToast(message);
            // The drawer stays open on purpose — the admin should see the
            // status pill and the new trail entry land on the record they
            // just acted on, rather than be returned to a list and left
            // to trust it worked.
          }}
        />
      )}

      {addOpen && (
        <AddTutorModal
          onClose={() => setAddOpen(false)}
          onOpenTutor={(userId) => {
            setAddOpen(false);
            setDrawerId(userId);
          }}
          onAdded={(message) => {
            setAddOpen(false);
            setToast(message);
            // The server action revalidates /admin/tutors, so the new row
            // arrives on the next render — which is exactly why 1b (the
            // list) had to exist before 1c (the action).
          }}
        />
      )}

      {toast && (
        <div className="adt-toast" role="status" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </>
  );
}

function TutorRow({ row, onOpen }: { row: TutorRecord; onOpen: () => void }) {
  const prof = profileLines(row);
  const approved = formatDate(row.approved_at);

  return (
    <div
      className="ao-table-row body adt-cols adt-row-btn"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {/* Reuses the shipped two-line lead cell verbatim
          (.ao-cell-lead / -text / -name / -email in enquiries.css) rather
          than restyling one — it is the same shape the enquiries board
          already renders. Avatar is .ao-tutor-avatar alone: the grey
          .ao-lead-avatar override is for non-tutors. */}
      <div className="ao-cell-lead">
        <div className="ao-tutor-avatar">{initials(row.name)}</div>
        <div className="ao-cell-lead-text">
          <div className="ao-cell-lead-name">{row.name}</div>
          <div className="ao-cell-lead-email">{row.email}</div>
        </div>
      </div>

      <div className="adt-cell">
        <div className="adt-cell-main">{prof.main}</div>
        <div className="adt-cell-sub">{prof.sub}</div>
      </div>

      <div className="adt-cell">
        <span className={`adt-source${sourceClass(row.source)}`}>
          {sourceLabel(row.source)}
        </span>
      </div>

      <div className="adt-num">{row.programme_count || '—'}</div>

      <div className="adt-cell">
        {/* NULL here now means one thing only — not approved yet — since
            the LEGACY rows were dated from nclex_user_roles.granted_at
            (migration 20260914120000). */}
        <div className="adt-cell-main">{approved ?? 'Not yet'}</div>
        <div className="adt-cell-sub">
          {approved ? (row.approved_by_name ? `by ${row.approved_by_name}` : '—') : 'awaiting a decision'}
        </div>
      </div>

      <div className="adt-cell">
        <StatusPill status={row.status} />
      </div>

      <div className="ao-th-actions">
        <span className="ao-action-link">Open →</span>
      </div>
    </div>
  );
}

// ⓘ TutorDrawer used to live here, and so did trailLabel/trailTone.
// Both moved in 2b: the drawer to @/lib/tutors/record-drawer, the trail
// helpers to @/lib/tutors/types.
//
// ⭐ The drawer merged with the applications queue's because they read
// the SAME ROW, and §2's founding decision for this arc is one row per
// person. Two partial views of it left an admin with two screens for one
// record and no way to tell which was authoritative — and a rejected
// applicant appears in both surfaces already. See record-drawer.tsx.
//
// Nothing was lost here: the shared drawer shows everything this one did,
// plus the application the tutor wrote, which this one never mentioned.
