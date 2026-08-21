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
import {
  hasPublicProfile,
  sourceClass,
  sourceLabel,
  type TutorDirectoryRow,
  type TutorDirectoryStats,
  type TutorStatus,
  type TutorTrailEntry,
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
function profileLines(row: TutorDirectoryRow): { main: string; sub: string } {
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
  rows: TutorDirectoryRow[];
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
        <TutorDrawer
          row={open}
          onClose={() => setDrawerId(null)}
          onSuspend={() => setSuspending(open.user_id)}
          onReinstate={() => setReinstating(open.user_id)}
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

function TutorRow({ row, onOpen }: { row: TutorDirectoryRow; onOpen: () => void }) {
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
        {row.status === 'SUSPENDED' ? (
          <span className="ao-pill adt-pill-susp">Suspended</span>
        ) : row.status === 'APPROVED' ? (
          <span className="ao-pill ao-pill-done">Approved</span>
        ) : (
          <span className="ao-pill">{row.status === 'PENDING' ? 'Pending' : 'Rejected'}</span>
        )}
      </div>

      <div className="ao-th-actions">
        <span className="ao-action-link">Open →</span>
      </div>
    </div>
  );
}

/**
 * What one trail entry says. Every entry is a transition, so the wording
 * comes from where it LANDED plus, where it matters, where it came from:
 * APPROVED means two different events depending on whether the previous
 * status was SUSPENDED, and calling a reinstatement "Approved as a tutor"
 * would hide the suspension it undoes.
 */
function trailLabel(e: TutorTrailEntry): string {
  switch (e.to) {
    case 'APPROVED':
      return e.from === 'SUSPENDED' ? 'Reinstated' : 'Approved as a tutor';
    case 'SUSPENDED':
      return 'Suspended';
    case 'REJECTED':
      return 'Application rejected';
    case 'PENDING':
      return e.from ? 'Re-applied' : 'Applied to become a tutor';
  }
}

/** Ring colour on the timeline. PENDING is neither good nor bad. */
function trailTone(to: TutorStatus): string {
  if (to === 'APPROVED') return 'is-good';
  if (to === 'SUSPENDED' || to === 'REJECTED') return 'is-bad';
  return '';
}

function TutorDrawer({
  row,
  onClose,
  onSuspend,
  onReinstate,
}: {
  row: TutorDirectoryRow;
  onClose: () => void;
  onSuspend: () => void;
  /**
   * ⚠ Both foot buttons only OPEN a dialog; neither acts. Reinstate used
   * to fire on click, per the design — it gained a confirm step because
   * it sits beside Close and, since 1d-i, a stray click leaves a
   * permanent trail entry. See reinstate-modal.tsx.
   */
  onReinstate: () => void;
}) {
  const approved = formatDate(row.approved_at);
  const firstApplied = formatDate(row.first_applied_at);

  // The applications line has to distinguish three genuinely different
  // things, or a row with no known decision gets described as a doorway
  // that had an implicit one.
  const applications =
    row.source === 'ADMIN_PROMOTION' || row.source === 'ADMIN_INVITE'
      ? 'None — no approval step on this doorway'
      : `Request #${row.submission_count}${firstApplied ? ` · first applied ${firstApplied}` : ''}`;

  return (
    <div className="adt-drawer-root">
      <div className="adt-scrim" onClick={onClose} />
      <aside className="adt-drawer" role="dialog" aria-label={`${row.name} — tutor record`}>
        <div className="adt-drawer-head">
          <div className="ao-tutor-avatar">{initials(row.name)}</div>
          <div className="adt-drawer-id">
            <span className="adt-drawer-name">{row.name}</span>
            <span className="adt-drawer-email">{row.email}</span>
          </div>
          <button type="button" className="adt-drawer-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="adt-drawer-body">
          <section>
            <div className="adt-sec-title">Standing</div>
            <dl className="adt-kv">
              <dt>Status</dt>
              <dd>
                {row.status === 'SUSPENDED' ? (
                  <span className="ao-pill adt-pill-susp">Suspended</span>
                ) : row.status === 'APPROVED' ? (
                  <span className="ao-pill ao-pill-done">Approved</span>
                ) : (
                  <span className="ao-pill">{row.status}</span>
                )}
              </dd>
              <dt>Source</dt>
              <dd>
                <span className={`adt-source${sourceClass(row.source)}`}>
                  {sourceLabel(row.source)}
                </span>
              </dd>
              <dt>First approved</dt>
              <dd>
                {approved
                  ? `${approved}${row.approved_by_name ? ` · by ${row.approved_by_name}` : ''}`
                  : 'Not yet — awaiting a decision'}
              </dd>
              <dt>Applications</dt>
              <dd>{applications}</dd>
            </dl>
          </section>

          <section>
            <div className="adt-sec-title">Public profile</div>
            <dl className="adt-kv">
              <dt>Headline</dt>
              <dd>{row.profile.headline || '—'}</dd>
              <dt>Speciality</dt>
              <dd>{row.profile.speciality || '—'}</dd>
              <dt>Experience</dt>
              <dd>
                {row.profile.years_experience
                  ? `${row.profile.years_experience} years tutoring`
                  : '—'}
              </dd>
              <dt>Programmes</dt>
              <dd className="adt-num">{row.programme_count}</dd>
            </dl>
            {/* Admin does not edit this. The tutor owns it, and the
                column grant from 1a means only they can write it. */}
            <p className="adt-drawer-hint">
              Tutors edit this themselves at /tutor/profile
            </p>
          </section>

          <section>
            <div className="adt-sec-title">Decision trail</div>
            {/* Read from nclex_tutors.decision_history (slice 1d-i). This
                used to be DERIVED from approved_at/decided_at, which could
                only ever show one prior decision — fine while no row could
                have two, wrong the moment suspend/reinstate exists. Older
                rows were backfilled to say exactly what the derivation
                said, so nothing changed for them. */}
            <ul className="adt-trail">
              {row.trail.length === 0 ? (
                <li>
                  No decisions recorded
                  <span className="adt-trail-when">{firstApplied ?? '—'}</span>
                </li>
              ) : (
                // Newest at the top. The array itself is append-ordered
                // and must not be sorted by date — see queries.ts.
                [...row.trail].reverse().map((e, i) => (
                  <li key={`${e.at}-${i}`} className={trailTone(e.to)}>
                    {trailLabel(e)}
                    {e.by_name ? ` by ${e.by_name}` : ''}
                    {e.reason ? ` — “${e.reason}”` : ''}
                    <span className="adt-trail-when">{formatDate(e.at) ?? '—'}</span>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>

        <div className="adt-drawer-foot">
          {/* One button, never both: the only two standings this drawer
              can act on are APPROVED and SUSPENDED, and each has exactly
              one move. A PENDING or REJECTED row belongs to the
              applications queue (2b), so it gets neither. */}
          {row.status === 'SUSPENDED' && (
            <button type="button" className="btn btn-accent btn-sm" onClick={onReinstate}>
              Reinstate…
            </button>
          )}
          {row.status === 'APPROVED' && (
            <button type="button" className="btn btn-danger btn-sm" onClick={onSuspend}>
              Suspend…
            </button>
          )}
          <button type="button" className="btn btn-sm adt-foot-end" onClick={onClose}>
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}
