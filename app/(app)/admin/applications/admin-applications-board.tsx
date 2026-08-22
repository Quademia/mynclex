// mynclex/app/(app)/admin/applications/admin-applications-board.tsx
//
// Client half of the tutor applications queue (sub-slice 2b). Single-use,
// so it lives next to its only caller per the folder convention.
//
// ⭐ THE DECISION IS INLINE, NOT A MODAL — the one place this deliberately
// differs from the directory next door. Suspend and reinstate are modals
// because they act on a row in a LIST: the admin is looking at twelve
// tutors and needs the consequences of acting on one put in front of
// them. Here the detail pane already IS the one applicant, in full, with
// their note and their history on screen — a dialog would cover the
// evidence at the exact moment it is being weighed.
//
// ⚠ Reject reveals a required reason box rather than firing. The RPC
// refuses a blank reason (that is the enforcement); the disabled button
// is the courtesy. And the applicant reads what is typed there — §9 keeps
// decision_reason precisely so a re-applicant knows what to fix, and the
// label says so rather than leaving the admin to guess.

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  approveApplicationAction,
  rejectApplicationAction,
} from '@/lib/tutors/actions';
import {
  isRolelessApplicant,
  sourceClass,
  sourceLabel,
  trailLabel,
  trailTone,
  type TutorApplicationRow,
  type TutorApplicationStats,
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

/**
 * "3 days ago" for the card's right-hand corner.
 *
 * Rough on purpose — the queue is sorted oldest-first and this only has
 * to convey "has this been sitting a while", which an exact timestamp
 * makes harder to read, not easier.
 */
function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

/**
 * The last decision anybody made on this row, or null on a first
 * application.
 *
 * ⚠ Read from the trail, not from decided_at/decision_reason. On a
 * re-application those scalars still hold the PREVIOUS verdict, which is
 * what we want to show — but only because nothing has overwritten them
 * yet. The trail says it directly, and keeps saying it after a second
 * decision lands. Scanned from the end: the array is append-ordered and
 * must never be sorted by date (see queries.ts).
 */
function previousDecision(row: TutorApplicationRow): TutorTrailEntry | null {
  for (let i = row.trail.length - 1; i >= 0; i--) {
    const e = row.trail[i];
    if (e.to !== 'PENDING') return e;
  }
  return null;
}

export function AdminApplicationsBoard({
  rows,
  stats,
}: {
  rows: TutorApplicationRow[];
  stats: TutorApplicationStats;
}) {
  const [tab, setTab] = useState<'PENDING' | 'DECIDED'>('PENDING');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const pending = useMemo(() => rows.filter((r) => r.status === 'PENDING'), [rows]);
  const decided = useMemo(
    () =>
      rows
        .filter((r) => r.status !== 'PENDING')
        // Newest verdict first: the decided tab is looked at to check
        // something recent, not to read the archive from the beginning.
        .sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? '')),
    [rows],
  );

  // ⚠ Selection is DERIVED, never trusted. After an approval the server
  // revalidates and that row leaves `pending` — holding the old id would
  // render a detail pane for somebody who is no longer in the list, or
  // nothing at all beside a queue with rows in it. Falling back to the
  // first row also means the admin lands on the next application with no
  // second click, which is how a queue is actually worked through.
  const selected =
    pending.find((r) => r.user_id === selectedId) ?? pending[0] ?? null;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      <header className="ao-page-head">
        <h1 className="ao-page-title">Tutor Applications</h1>
        <p className="ao-page-sub">
          People who asked to teach on MyNclex. Approving grants the TUTOR
          role and puts them on the free tier; rejecting is not terminal —
          they can update their details and resubmit.
        </p>
      </header>

      <div className="adt-tabs" role="tablist" aria-label="Application queue">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'PENDING'}
          className={`adt-tab${tab === 'PENDING' ? ' is-on' : ''}`}
          onClick={() => setTab('PENDING')}
        >
          Pending ({stats.pending})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'DECIDED'}
          className={`adt-tab${tab === 'DECIDED' ? ' is-on' : ''}`}
          onClick={() => setTab('DECIDED')}
        >
          Decided ({stats.decided})
        </button>
      </div>

      {tab === 'PENDING' ? (
        pending.length === 0 ? (
          <div className="adt-empty">
            <div className="adt-empty-title">The queue is clear</div>
            <div className="adt-empty-sub">
              New applications also arrive by email, so nothing waits here
              unseen.
            </div>
          </div>
        ) : (
          <div className="adt-queue">
            <div className="adt-app-list">
              {pending.map((r) => (
                <button
                  key={r.user_id}
                  type="button"
                  className={`adt-app-card${
                    selected?.user_id === r.user_id ? ' is-sel' : ''
                  }`}
                  onClick={() => setSelectedId(r.user_id)}
                >
                  <div className="adt-app-card-top">
                    <div className="ao-tutor-avatar">{initials(r.name)}</div>
                    <span className="adt-app-card-name">{r.name}</span>
                    {/* Only from the second request on. "Request #1" on
                        every card is noise; "#2" is the signal. */}
                    {r.submission_count > 1 && (
                      <span className="adt-req-badge">
                        Request #{r.submission_count}
                      </span>
                    )}
                  </div>
                  <div className="adt-app-card-meta">
                    <span className={`adt-source${sourceClass(r.source)}`}>
                      {sourceLabel(r.source)}
                    </span>
                    <span style={{ marginLeft: 'auto' }}>
                      {relativeTime(r.last_applied_at)}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {selected && (
              <ApplicationDetail
                key={selected.user_id}
                row={selected}
                onDone={(message) => setToast(message)}
              />
            )}
          </div>
        )
      ) : (
        <DecidedTable rows={decided} />
      )}

      {toast && (
        <div className="adt-toast" role="status" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </>
  );
}

function ApplicationDetail({
  row,
  onDone,
}: {
  row: TutorApplicationRow;
  onDone: (message: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prev = previousDecision(row);
  const roleless = isRolelessApplicant(row);

  async function approve() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const res = await approveApplicationAction(row.user_id);
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }

    // "changed: false" means another admin already decided it, or this is
    // a second click. Reporting an approval that did not happen here
    // would be the same lie the suspend modal refuses to tell.
    onDone(
      res.changed
        ? `${res.name} approved — TUTOR granted, free tier, and they have been emailed.`
        : `${res.name} was already approved — nothing changed.`,
    );
  }

  async function reject() {
    if (busy || reason.trim().length === 0) return;
    setBusy(true);
    setError(null);

    const res = await rejectApplicationAction(row.user_id, reason);
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }

    onDone(
      res.changed
        ? `${res.name}'s application rejected — they have been emailed the reason and can resubmit.`
        : `${res.name}'s application was already decided — nothing changed.`,
    );
  }

  return (
    <div className="adt-detail">
      <div className="adt-detail-head">
        <div className="ao-tutor-avatar">{initials(row.name)}</div>
        <div className="adt-drawer-id">
          <span className="adt-drawer-name">{row.name}</span>
          <span className="adt-drawer-email">
            {row.email}
            {row.phone ? ` · ${row.phone}` : ''}
          </span>
        </div>
        {row.submission_count > 1 && (
          <span className="adt-req-badge" style={{ marginLeft: 'auto' }}>
            Request #{row.submission_count}
          </span>
        )}
      </div>

      {/* ⭐ Branches on ROLES, not on `source` (§5: nothing branches on
          source). The two cases land in genuinely different places after
          a decision, and an admin who is told the wrong one will look for
          this person somewhere they are not. */}
      <div className="adt-callout">
        <span aria-hidden="true">ⓘ</span>
        <span>
          {roleless ? (
            <>
              <strong>No roles yet.</strong> Their account exists but grants
              nothing. Until this is decided, signing in takes them to their
              application status — not to a workspace.
            </>
          ) : (
            <>
              <strong>Already a student here.</strong> They keep that access
              while this is pending, and see their application on their
              student picker. “Was already our student” is a real vetting
              signal.
            </>
          )}
        </span>
      </div>

      <dl className="adt-kv">
        <dt>Source</dt>
        <dd>
          <span className={`adt-source${sourceClass(row.source)}`}>
            {sourceLabel(row.source)}
          </span>
        </dd>
        <dt>Organisation</dt>
        <dd>{row.organisation || '—'}</dd>
        <dt>First applied</dt>
        <dd>{formatDate(row.first_applied_at) ?? '—'}</dd>
        <dt>This submission</dt>
        <dd>{formatDate(row.last_applied_at) ?? '—'}</dd>
      </dl>

      {row.request_note && <div className="adt-note">{row.request_note}</div>}

      {/* Only when a prior decision exists — which is what makes a
          resubmission reviewable without leaving the screen. */}
      {prev && (
        <div className="adt-prev-decision">
          <strong>
            {prev.to === 'REJECTED' ? 'Rejected' : `Previously ${prev.to.toLowerCase()}`}
            {formatDate(prev.at) ? ` ${formatDate(prev.at)}` : ''}
            {prev.by_name ? ` by ${prev.by_name}` : ''}
          </strong>
          {prev.reason ? ` — “${prev.reason}”` : ''}
        </div>
      )}

      {error && <p className="adt-form-error">{error}</p>}

      {rejecting ? (
        <>
          <div className="form-group">
            <label htmlFor="reject-reason">
              Reason{' '}
              <span className="form-hint">
                (sent to the applicant, and shown to them if they resubmit)
              </span>
            </label>
            <textarea
              id="reject-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What was missing, in enough detail that they could fix it."
              disabled={busy}
            />
          </div>
          <div className="adt-decide">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setRejecting(false);
                setReason('');
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={reject}
              disabled={busy || reason.trim().length === 0}
            >
              {busy ? 'Rejecting…' : 'Confirm rejection'}
            </button>
            <span className="adt-decide-note">
              Not terminal — they can update and resubmit, and their record
              keeps this reason so they know what to change.
            </span>
          </div>
        </>
      ) : (
        <div className="adt-decide">
          <button
            type="button"
            className="btn btn-accent btn-sm"
            onClick={approve}
            disabled={busy}
          >
            {busy ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => setRejecting(true)}
            disabled={busy}
          >
            Reject…
          </button>
          <span className="adt-decide-note">
            Approve grants TUTOR <strong>additively</strong> —{' '}
            {roleless
              ? 'their first role'
              : 'their student access is kept'} — puts them on the free tier
            (plan choice is never part of admission) and emails them.
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The archive. A TABLE, not the queue's card list — and the difference is
 * volume, not taste (settled with Sam, 2026-08-22).
 *
 * Pending is a queue you keep EMPTY: you work it one at a time and act on
 * each, which is what the detail pane's bottom half is for. Decided grows
 * forever, is scanned rather than worked, and has no action at the end of
 * it — so it keeps the columns, which stay readable at two hundred rows
 * where a card list does not.
 *
 * ⭐ But a row OPENS. Before this it was dead text sitting beside a tab
 * where records are clickable, which is the worse inconsistency: two
 * things that look alike behaving differently. And five columns cannot
 * hold what this tab exists to answer — "have they tried before, and why
 * did we say no?" — because the applicant's note, their organisation and
 * the full trail are all absent from it.
 *
 * The drawer is deliberately the same gesture /admin/tutors already uses
 * for "the whole record of one person", rather than a third pattern.
 */
function DecidedTable({ rows }: { rows: TutorApplicationRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? (rows.find((r) => r.user_id === openId) ?? null) : null;

  if (rows.length === 0) {
    return (
      <div className="adt-empty">
        <div className="adt-empty-title">Nothing decided yet</div>
        <div className="adt-empty-sub">
          Approvals and rejections both stay here, so you can check whether
          somebody has asked before.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="adt-table-scroll">
        <div className="ao-table">
          <div className="ao-table-row head adt-decided-cols">
            <span>Applicant</span>
            <span>Outcome</span>
            <span>Decided</span>
            <span>Reason</span>
            <span>Request #</span>
          </div>

          {rows.map((r) => (
            <div
              key={r.user_id}
              className="ao-table-row body adt-decided-cols adt-row-btn"
              role="button"
              tabIndex={0}
              onClick={() => setOpenId(r.user_id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpenId(r.user_id);
                }
              }}
            >
              <div className="ao-cell-lead">
                <div className="ao-tutor-avatar">{initials(r.name)}</div>
                <div className="ao-cell-lead-text">
                  <div className="ao-cell-lead-name">{r.name}</div>
                  {/* ⓘ CD's design puts "Took the student conversion" here
                      for a rejected applicant who converted. Not rendered:
                      that button lands in 2c, so no row can carry the fact
                      yet, and deriving it now would be a branch that never
                      runs. Add it with the conversion, not before. */}
                  <div className="ao-cell-lead-email">{r.email}</div>
                </div>
              </div>

              <div className="adt-cell">
                {r.status === 'APPROVED' ? (
                  <span className="ao-pill ao-pill-done">Approved</span>
                ) : r.status === 'SUSPENDED' ? (
                  <span className="ao-pill adt-pill-susp">Suspended</span>
                ) : (
                  <span className="ao-pill">Rejected</span>
                )}
              </div>

              <div className="adt-cell">
                <div className="adt-cell-main">{formatDate(r.decided_at) ?? '—'}</div>
                <div className="adt-cell-sub">
                  {r.decided_by_name ? `by ${r.decided_by_name}` : '—'}
                </div>
              </div>

              {/* An approval takes no reason, so the dash here is the normal
                  case rather than missing data.

                  ⓘ .adt-reason, not .adt-cell-sub: the sibling clamps to one
                  line, which cut most refusals off before they said
                  anything. Two lines, then an ellipsis — the full text is
                  on the record and in the email the applicant already has,
                  so this column only has to be enough to recognise. */}
              <div className="adt-cell">
                <div className={r.decision_reason ? 'adt-reason' : 'adt-cell-sub'}>
                  {r.decision_reason || '—'}
                </div>
              </div>

              <div className="adt-num">{r.submission_count}</div>
            </div>
          ))}
        </div>
      </div>

      {open && <DecidedDrawer row={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

/**
 * The whole record of one decided applicant, read-only.
 *
 * ⚠ IT FRAMES THE APPLICATION, NOT THE TUTOR — which is what keeps it
 * from being a second copy of the directory's drawer. A rejected
 * applicant also appears in /admin/tutors under "All statuses", with the
 * same trail in its drawer; that one shows the public profile and a
 * programme count, because it answers "what kind of tutor is this". This
 * one shows what they wrote and what we decided, because it answers "why
 * did we say no". If that split ever stops holding, the right fix is ONE
 * shared record drawer, not two that have drifted.
 *
 * ⭐ Hence the foot link on an approved row. The queue owns the
 * application; the directory owns the tutor. Naming that boundary on
 * screen is what stops an admin working the archive when they should be
 * looking at a live tutor's record.
 */
function DecidedDrawer({
  row,
  onClose,
}: {
  row: TutorApplicationRow;
  onClose: () => void;
}) {
  return (
    <div className="adt-drawer-root">
      <div className="adt-scrim" onClick={onClose} />
      <aside
        className="adt-drawer"
        role="dialog"
        aria-label={`${row.name} — tutor application`}
      >
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
            <div className="adt-sec-title">Outcome</div>
            <dl className="adt-kv">
              <dt>Decision</dt>
              <dd>
                {row.status === 'APPROVED' ? (
                  <span className="ao-pill ao-pill-done">Approved</span>
                ) : row.status === 'SUSPENDED' ? (
                  <span className="ao-pill adt-pill-susp">Suspended</span>
                ) : (
                  <span className="ao-pill">Rejected</span>
                )}
              </dd>
              <dt>Decided</dt>
              <dd>
                {formatDate(row.decided_at) ?? '—'}
                {row.decided_by_name ? ` · by ${row.decided_by_name}` : ''}
              </dd>
              {/* An approval takes no reason (the RPC requires one only
                  for REJECTED and SUSPENDED), so this row is absent
                  rather than showing a dash where a sentence belongs. */}
              {row.decision_reason && (
                <>
                  <dt>Reason</dt>
                  <dd>{row.decision_reason}</dd>
                </>
              )}
            </dl>
          </section>

          <section>
            <div className="adt-sec-title">What they applied with</div>
            <dl className="adt-kv">
              <dt>Source</dt>
              <dd>
                <span className={`adt-source${sourceClass(row.source)}`}>
                  {sourceLabel(row.source)}
                </span>
              </dd>
              <dt>Organisation</dt>
              <dd>{row.organisation || '—'}</dd>
              <dt>First applied</dt>
              <dd>{formatDate(row.first_applied_at) ?? '—'}</dd>
              <dt>Submissions</dt>
              <dd>{row.submission_count}</dd>
            </dl>
            {/* The note is the substance of an application and the table
                has no room for it at all — half the reason this drawer
                exists. */}
            {row.request_note ? (
              <div className="adt-note" style={{ marginTop: 10 }}>
                {row.request_note}
              </div>
            ) : (
              <p className="adt-drawer-hint">They wrote no note.</p>
            )}
          </section>

          <section>
            <div className="adt-sec-title">Decision trail</div>
            {/* Every transition, including re-applications — the thing
                five columns could never show. Newest first; the array is
                append-ordered and must not be sorted by date. */}
            <ul className="adt-trail">
              {row.trail.length === 0 ? (
                <li>
                  No decisions recorded
                  <span className="adt-trail-when">—</span>
                </li>
              ) : (
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
          {row.status !== 'REJECTED' && (
            <a className="btn btn-sm" href="/admin/tutors">
              Open their tutor record →
            </a>
          )}
          <button type="button" className="btn btn-sm adt-foot-end" onClick={onClose}>
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}
