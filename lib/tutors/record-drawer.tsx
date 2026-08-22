// mynclex/lib/tutors/record-drawer.tsx
//
// ONE person's whole tutor record, opened from either TUTORS_MANAGE
// surface. Slice 2b; replaces the two drawers that grew separately in 1b
// and 2b.
//
// ⭐ WHY IT MERGED (Sam, 2026-08-22). The directory had a drawer showing
// the public profile and programme count; the queue grew one showing the
// application payload and the decision. Both read the SAME ROW — and §2's
// founding decision for this whole arc is one row per person, chosen over
// a per-request table precisely so there would be a single thing that
// represents the tutor. Two partial views of it put an admin in front of
// two screens for one record with no way to tell which is authoritative,
// and a rejected applicant appears in BOTH surfaces already.
//
// It also removed a recurring tax: every new column on nclex_tutors
// needed somebody to decide which drawer it belonged in, and that
// decision would have been made inconsistently forever.
//
// ⭐ THE SECTIONS SUPPRESS THEMSELVES, so this is not a compromise view —
// it is more honest than either drawer was. The directory used to hide
// that a tutor had ever written an application; the queue used to hide
// whether they had filled in a profile. Now a row that never applied has
// no application section, and everything a row DOES carry is on screen
// wherever you opened it from.
//
// ⚠ Which is why the loaders must fetch every column (see queries.ts).
// A self-suppressing section cannot tell "empty" from "not loaded".
//
// The only genuinely page-specific part is what you can DO from here, so
// that is a slot: the directory passes Suspend/Reinstate, the queue
// passes a link across to the directory, an unowned caller passes
// nothing.

'use client';

import type { ReactNode } from 'react';
import {
  hasApplication,
  sourceClass,
  sourceLabel,
  trailLabel,
  trailTone,
  type TutorRecord,
  type TutorTrailEntry,
} from './types';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  // ⚠ Guard, because this renders a value we did not format ourselves.
  // Every `at` in decision_history comes from the RPC's now(), which
  // serialises with a full offset and parses fine — but a hand-written
  // or backfilled entry can carry a shape JS refuses (a bare "+00"
  // instead of "+00:00"), and `new Date()` answers that with the string
  // "Invalid Date", which then renders as those two words in the middle
  // of somebody's decision trail. A dash says "no usable date" and is
  // true; "Invalid Date" says nothing to the person reading it.
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The status pill — worded AND coloured the same wherever a record is
 * shown. One definition, so the directory's Status column, the queue's
 * Outcome column and this drawer cannot disagree about what a standing
 * looks like.
 *
 * ⚠ REJECTED and SUSPENDED are both red and deliberately NOT the same
 * pill: with Rejected now in the directory's filter, an admin can see
 * both on one screen, and two identical red pills would be two different
 * facts wearing one face. Suspended is filled — a live restriction on
 * somebody who is ours. Rejected is outlined — a settled outcome about
 * somebody who never got in.
 *
 * PENDING keeps the neutral pill: it is not good news or bad, it is
 * unfinished business.
 */
export function StatusPill({ status }: { status: TutorRecord['status'] }) {
  if (status === 'SUSPENDED') return <span className="ao-pill adt-pill-susp">Suspended</span>;
  if (status === 'APPROVED') return <span className="ao-pill ao-pill-done">Approved</span>;
  if (status === 'REJECTED') return <span className="ao-pill adt-pill-rej">Rejected</span>;
  return <span className="ao-pill">Pending</span>;
}

export function TutorRecordDrawer({
  row,
  onClose,
  actions,
}: {
  row: TutorRecord;
  onClose: () => void;
  /** Page-specific buttons for the foot. Close is always added after. */
  actions?: ReactNode;
}) {
  const approved = formatDate(row.approved_at);
  const firstApplied = formatDate(row.first_applied_at);

  return (
    <div className="adt-drawer-root">
      <div className="adt-scrim" onClick={onClose} />
      <aside className="adt-drawer" role="dialog" aria-label={`${row.name} — tutor record`}>
        <div className="adt-drawer-head">
          <div className="ao-tutor-avatar">{initials(row.name)}</div>
          <div className="adt-drawer-id">
            <span className="adt-drawer-name">{row.name}</span>
            <span className="adt-drawer-email">
              {row.email}
              {row.phone ? ` · ${row.phone}` : ''}
            </span>
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
                <StatusPill status={row.status} />
              </dd>
              <dt>Source</dt>
              <dd>
                <span className={`adt-source${sourceClass(row.source)}`}>
                  {sourceLabel(row.source)}
                </span>
              </dd>
              <dt>First approved</dt>
              <dd>
                {/* NULL here means one thing only — not approved yet —
                    since the LEGACY rows were dated from
                    nclex_user_roles.granted_at (migration 20260914120000).
                    ⚠ But "not yet" is TWO different facts now that this
                    drawer opens over rejected applicants too. Telling
                    somebody who was turned down that they are "awaiting a
                    decision" describes a queue they are not in — the
                    wording is inherited from 1b, when only APPROVED and
                    SUSPENDED rows could reach this panel. */}
                {approved
                  ? `${approved}${row.approved_by_name ? ` · by ${row.approved_by_name}` : ''}`
                  : row.status === 'REJECTED'
                    ? 'Never — the application was refused'
                    : 'Not yet — awaiting a decision'}
              </dd>
              {/* The LAST decision of any kind, suspensions included.
                  Shown only once there has been one, so a fresh PENDING
                  row does not carry a row of dashes. */}
              {row.decided_at && (
                <>
                  <dt>Last decision</dt>
                  <dd>
                    {formatDate(row.decided_at)}
                    {row.decided_by_name ? ` · by ${row.decided_by_name}` : ''}
                    {row.decision_reason ? ` — “${row.decision_reason}”` : ''}
                  </dd>
                </>
              )}
            </dl>
          </section>

          {/* ⭐ Absent entirely for an admin promotion or an invite: those
              doorways have no approval step, so there is no application
              to show and a section of dashes would imply one went
              missing. */}
          {hasApplication(row) && (
            <section>
              <div className="adt-sec-title">Their application</div>
              <dl className="adt-kv">
                <dt>Organisation</dt>
                <dd>{row.organisation || '—'}</dd>
                <dt>First applied</dt>
                <dd>{firstApplied ?? '—'}</dd>
                <dt>Latest submission</dt>
                <dd>{formatDate(row.last_applied_at) ?? '—'}</dd>
                <dt>Submissions</dt>
                <dd>{row.submission_count}</dd>
              </dl>
              {/* The note is the substance of an application, and no
                  table column can hold it. */}
              {row.request_note ? (
                <div className="adt-note" style={{ marginTop: 10 }}>
                  {row.request_note}
                </div>
              ) : (
                <p className="adt-drawer-hint">They wrote no note.</p>
              )}
            </section>
          )}

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
            <p className="adt-drawer-hint">Tutors edit this themselves at /tutor/profile</p>
          </section>

          <section>
            <div className="adt-sec-title">Decision trail</div>
            {/* Read from nclex_tutors.decision_history (slice 1d-i). This
                used to be DERIVED from approved_at/decided_at, which
                could only ever show one prior decision — fine while no
                row could have two, wrong the moment suspend/reinstate
                exists. Older rows were backfilled to say exactly what the
                derivation said, so nothing changed for them. */}
            <ul className="adt-trail">
              {row.trail.length === 0 ? (
                <li>
                  No decisions recorded
                  <span className="adt-trail-when">{firstApplied ?? '—'}</span>
                </li>
              ) : (
                // Newest at the top. The array itself is append-ordered
                // and must not be sorted by date — see queries.ts.
                [...row.trail].reverse().map((e: TutorTrailEntry, i: number) => (
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
          {actions}
          <button type="button" className="btn btn-sm adt-foot-end" onClick={onClose}>
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}
