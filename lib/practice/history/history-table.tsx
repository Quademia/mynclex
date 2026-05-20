// mynclex/lib/practice/history/history-table.tsx
//
// History table — every past attempt (up to 50), one row each. Click
// behaviour by status:
//   COMPLETED / TIMED_OUT  → /session/[id] in review mode
//   IN_PROGRESS            → /session/[id], DRAFT-restore picks up state
//   ABANDONED              → no link (discarded; nothing to open)
//
// Search input + filter chips render disabled as visible placeholders
// for slice 7.1 polish (real filtering + search land then). The
// show-discarded toggle is the only working filter in MVP.

'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type {
  HistoryAttempt,
  AttemptStatus,
  AttemptSource,
} from './types';
import { formatRelativeDate, formatScore } from './format';
import { summariseRecent } from '@/lib/practice/launchers/summarise-recent';

const STATUS_LABEL: Record<AttemptStatus, string> = {
  COMPLETED: 'Done',
  TIMED_OUT: 'Done',
  IN_PROGRESS: 'Resume',
  ABANDONED: 'Discarded',
};

const STATUS_PILL_CLASS: Record<AttemptStatus, string> = {
  COMPLETED: 'hist-pill hist-pill-done',
  TIMED_OUT: 'hist-pill hist-pill-done',
  IN_PROGRESS: 'hist-pill hist-pill-resume',
  ABANDONED: 'hist-pill hist-pill-discarded',
};

// Forward-compat: v1 only writes CUSTOM_BUILT, but the schema allows
// the other two — render correctly without a rewrite when they ship.
const SOURCE_LABEL: Record<AttemptSource, string> = {
  CUSTOM_BUILT: 'Custom',
  READINESS_PACK: 'Pack',
  PROGRAMME_ASSIGNED: 'Programme',
};

function ActionCell({ row }: { row: HistoryAttempt }) {
  if (row.status === 'ABANDONED') {
    return <span className="hist-action-empty">discarded</span>;
  }
  const label = row.status === 'IN_PROGRESS' ? 'Resume →' : 'Review →';
  return (
    <Link className="hist-action-link" href={`/session/${row.attempt_id}`}>
      {label}
    </Link>
  );
}

export function HistoryTable({ attempts }: { attempts: HistoryAttempt[] }) {
  const [showAbandoned, setShowAbandoned] = useState(false);

  const visible = useMemo(
    () =>
      showAbandoned
        ? attempts
        : attempts.filter((a) => a.status !== 'ABANDONED'),
    [attempts, showAbandoned]
  );

  const abandonedCount = attempts.filter(
    (a) => a.status === 'ABANDONED'
  ).length;

  return (
    <>
      <div className="hist-filter-row">
        <div className="hist-seg" title="Coming soon" aria-disabled="true">
          <button className="on" disabled>All</button>
          <button disabled>Custom</button>
          <button disabled>Packs</button>
          {/* "Programme" chip dropped in progress engine Slice 4 —
              programme attempts live on the dedicated programme/
              cohort history pages, not here. */}
        </div>
        <div className="hist-seg" title="Coming soon" aria-disabled="true">
          <button className="on" disabled>Any mode</button>
          <button disabled>Untimed</button>
          <button disabled>Timed</button>
          <button disabled>CAT</button>
        </div>

        <label className="hist-toggle">
          <input
            type="checkbox"
            checked={showAbandoned}
            onChange={(e) => setShowAbandoned(e.target.checked)}
            disabled={abandonedCount === 0}
          />
          Show discarded
          {abandonedCount > 0 && (
            <span className="hist-toggle-count">({abandonedCount})</span>
          )}
        </label>

        <input
          className="hist-search"
          placeholder="Search by topic, type, …"
          disabled
          title="Coming soon"
        />
      </div>

      {visible.length === 0 ? (
        <div className="hist-empty">
          {attempts.length === 0
            ? 'No sessions yet — your first quiz from the Question Bank will land here.'
            : 'Nothing to show. Toggle "Show discarded" if you\'re looking for an abandoned session.'}
        </div>
      ) : (
        <div className="hist-card">
          <table className="hist-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Session</th>
                <th>Source · Mode</th>
                <th>Result</th>
                <th>State</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.attempt_id}>
                  <td className="hist-when">{formatRelativeDate(r.created_at)}</td>
                  <td className="hist-session">
                    {summariseRecent(r.filters_json, r.requested_count)}
                  </td>
                  <td>
                    <span className="hist-pill hist-pill-source">
                      {SOURCE_LABEL[r.source]}
                    </span>
                    <span className="hist-pill hist-pill-mode">
                      {r.mode_label}
                    </span>
                  </td>
                  <td className="hist-result">{formatScore(r.final_score)}</td>
                  <td>
                    <span className={STATUS_PILL_CLASS[r.status]}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td>
                    <ActionCell row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="hist-note">
        <strong>Note.</strong> In-progress sessions resume from where you
        left off. Completed and timed-out sessions are reviewable.
        Discarded sessions can&apos;t be reopened.
      </p>
    </>
  );
}
