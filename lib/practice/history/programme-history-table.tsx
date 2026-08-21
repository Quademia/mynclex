// mynclex/lib/practice/history/programme-history-table.tsx
//
// Progress engine Slice 4 — programme-side attempt history table.
// Parallel to the bank-side <HistoryTable> but column-shaped for
// programme attempts: activity title + unit label instead of
// summariseRecent(); a small ✓ badge next to the activity title
// when its progress row is DONE; an activity-filter dropdown at
// the top so a multi-activity student can narrow to one quiz.
//
// Click behaviour is identical to bank — COMPLETED / TIMED_OUT and
// IN_PROGRESS link to /session/[id]; ABANDONED is unlinkable.

'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatRelativeDate, formatScore } from './format';
import { unitLabel } from '@/lib/curriculum/format';
import type { UnitLabel } from '@/lib/programmes/types';
import type {
  AttemptStatus,
  ProgrammeHistoryAttempt,
} from './programme-types';

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

function ActionCell({ row }: { row: ProgrammeHistoryAttempt }) {
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

/**
 * Pass/fail decoration on the score column. Only renders when the
 * attempt has a pass_score (tutor-quiz Slice 3 — ungraded attempts
 * keep just the score).
 */
function passFailHint(row: ProgrammeHistoryAttempt): string | null {
  if (row.pass_score === null || row.final_score === null) return null;
  return row.final_score >= row.pass_score ? 'Pass' : 'Fail';
}

/**
 * Format for the Attempt column. Honest fallback when the displayed
 * ordinal exceeds the (current) cap — happens if the tutor lowered
 * max_attempts after the student already exceeded it. Rendering
 * "3 of 2" would be visually wrong; we drop the "of M" instead.
 */
function formatAttempt(
  ordinal: number,
  cap: number | null
): string {
  if (cap === null || ordinal > cap) return String(ordinal);
  return `${ordinal} of ${cap}`;
}

export function ProgrammeHistoryTable({
  attempts,
  unitLabelKind,
}: {
  attempts: ProgrammeHistoryAttempt[];
  /** Drives the "Week N" / "Module N" fallback when a unit has no
   *  tutor-set title. Passed in from the page so we don't re-query. */
  unitLabelKind: UnitLabel;
}) {
  const [activityFilter, setActivityFilter] = useState<string>('ALL');
  const [showAbandoned, setShowAbandoned] = useState(false);

  // Distinct activities in the dataset, ordered by unit then title.
  // Drives the filter dropdown options.
  const activityOptions = useMemo(() => {
    const seen = new Map<
      string,
      { activity_id: string; activity_title: string; unit_index: number }
    >();
    for (const a of attempts) {
      if (!seen.has(a.activity_id)) {
        seen.set(a.activity_id, {
          activity_id: a.activity_id,
          activity_title: a.activity_title,
          unit_index: a.unit_index,
        });
      }
    }
    return Array.from(seen.values()).sort((x, y) => {
      if (x.unit_index !== y.unit_index) return x.unit_index - y.unit_index;
      return x.activity_title.localeCompare(y.activity_title);
    });
  }, [attempts]);

  const visible = useMemo(() => {
    return attempts.filter((a) => {
      if (activityFilter !== 'ALL' && a.activity_id !== activityFilter) {
        return false;
      }
      if (!showAbandoned && a.status === 'ABANDONED') return false;
      return true;
    });
  }, [attempts, activityFilter, showAbandoned]);

  const abandonedCount = attempts.filter(
    (a) => a.status === 'ABANDONED'
  ).length;

  return (
    // `hist-programme` is the hook the phone layout hangs off: at ≤768px
    // history.css reflows this table into one stacked card per attempt,
    // labelling each cell from its `data-label`. Without the wrapper the
    // seven columns stay a 652px table inside a clipping card, and Result,
    // State and the Review link are cut off with no way to scroll to them.
    <div className="hist-programme">
      <div className="hist-filter-row">
        <label className="hist-activity-filter">
          <span className="hist-activity-filter-label">Activity</span>
          <select
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value)}
          >
            <option value="ALL">All activities</option>
            {activityOptions.map((o) => (
              <option key={o.activity_id} value={o.activity_id}>
                {unitLabel(o.unit_index, unitLabelKind)} · {o.activity_title}
              </option>
            ))}
          </select>
        </label>

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
      </div>

      {visible.length === 0 ? (
        <div className="hist-empty">
          {attempts.length === 0
            ? "No attempts yet — start a Mock or Practice Quiz from the curriculum to see it here."
            : 'No attempts match this filter.'}
        </div>
      ) : (
        <div className="hist-card">
          <table className="hist-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Activity</th>
                <th>Attempt</th>
                <th>Mode</th>
                <th>Result</th>
                <th>State</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const verdict = passFailHint(r);
                return (
                  <tr key={r.attempt_id}>
                    {/* data-label feeds the ≤768px stacked layout's ::before
                        labels — see history.css. The activity cell needs none:
                        it leads the card and identifies the row. */}
                    <td className="hist-when" data-label="When">
                      {formatRelativeDate(r.created_at)}
                    </td>
                    <td className="hist-activity">
                      <div className="hist-activity-title">
                        {r.activity_title}
                        {r.activity_is_done && (
                          <span
                            className="hist-activity-done"
                            aria-label="Activity completed"
                            title="Activity completed"
                          >
                            ✓
                          </span>
                        )}
                      </div>
                      <div className="hist-activity-unit">
                        {unitLabel(r.unit_index, unitLabelKind)}
                        {r.unit_title ? ` · ${r.unit_title}` : ''}
                      </div>
                    </td>
                    <td className="hist-attempt" data-label="Attempt">
                      {formatAttempt(r.attempt_ordinal, r.max_attempts)}
                    </td>
                    <td data-label="Mode">
                      <span className="hist-pill hist-pill-mode">
                        {r.mode_label}
                      </span>
                    </td>
                    <td className="hist-result" data-label="Result">
                      {formatScore(r.final_score)}
                      {verdict && (
                        <span
                          className={
                            verdict === 'Pass'
                              ? 'hist-verdict hist-verdict-pass'
                              : 'hist-verdict hist-verdict-fail'
                          }
                        >
                          {' · '}
                          {verdict}
                        </span>
                      )}
                    </td>
                    <td data-label="State">
                      <span className={STATUS_PILL_CLASS[r.status]}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="hist-action-cell">
                      <ActionCell row={r} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="hist-note">
        <strong>Note.</strong> In-progress attempts resume from where you
        left off. Completed and timed-out attempts are reviewable.
        Discarded attempts can&apos;t be reopened.
      </p>
    </div>
  );
}
