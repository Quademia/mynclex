// mynclex/lib/analytics/tutor/student-drawer.tsx
//
// Per-student drill-in drawer (Phase 1 = completion). Slides in from the
// right; shows the student's headline figures + a week-banded completion
// timeline (done / not done / locked per activity). This is the seed of the
// future per-student "360" view — kept completion-only for now.

'use client';

import { useEffect } from 'react';
import { Avatar, StatusPill, ACTIVITY_META } from './atoms';
import type { ActivityAnalyticsRow, StudentAnalyticsRow } from './types';
import type { UnitLabel } from '@/lib/programmes/types';

function unitWord(label: UnitLabel): string {
  return label === 'WEEK' ? 'Week' : 'Module';
}

function fmtWhen(iso: string | null): string {
  if (!iso) return 'done';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function StudentDrawer({
  student,
  activities,
  unitLabel,
  onClose,
}: {
  student: StudentAnalyticsRow;
  activities: ActivityAnalyticsRow[];
  unitLabel: UnitLabel;
  onClose: () => void;
}) {
  // Esc closes; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Group activities into their units (already sorted by the query).
  const byUnit = new Map<number, { title: string; rows: ActivityAnalyticsRow[] }>();
  for (const a of activities) {
    const g = byUnit.get(a.unitIndex) ?? { title: a.unitTitle, rows: [] };
    g.rows.push(a);
    byUnit.set(a.unitIndex, g);
  }

  return (
    <div className="an-drawer-backdrop" onClick={onClose}>
      <aside className="an-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${student.name} progress`}>
        <header className="an-drawer-head">
          <Avatar name={student.name} />
          <div style={{ minWidth: 0 }}>
            <div className="nm">{student.name}</div>
            <div className="em">{student.email}</div>
          </div>
          <button className="an-drawer-x" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="an-drawer-body">
          <div className="an-drawer-stat">
            <div className="s">
              <div className="v">{student.completionPct}%</div>
              <div className="l">{student.doneCount} of {student.releasedCount} released done</div>
            </div>
            <div className="s">
              <StatusPill status={student.status} />
              <div className="l" style={{ marginTop: 6 }}>
                {student.lastActiveDays == null
                  ? 'No activity yet'
                  : student.lastActiveDays === 0
                    ? 'Active today'
                    : `Last active ${student.lastActiveDays}d ago`}
              </div>
            </div>
          </div>

          <div className="an-timeline">
            {[...byUnit.entries()].map(([unitIndex, g]) => (
              <div key={unitIndex}>
                <div className="an-tl-week">{unitWord(unitLabel)} {unitIndex} · {g.title}</div>
                {g.rows.map((a) => {
                  const done = Object.prototype.hasOwnProperty.call(student.doneAt, a.activityId);
                  const locked = !a.released && !done;
                  const meta = ACTIVITY_META[a.type];
                  return (
                    <div key={a.activityId} className={`an-tl-row ${done ? '' : 'is-todo'}`}>
                      <span className={`an-tl-check ${done ? 'done' : locked ? 'locked' : 'todo'}`}>
                        {done ? '✓' : locked ? '·' : ''}
                      </span>
                      <span className="t" title={meta.label}>{a.title}</span>
                      <span className="when">
                        {done ? fmtWhen(student.doneAt[a.activityId]) : locked ? 'locked' : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
