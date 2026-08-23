// mynclex/lib/analytics/tutor/student-drawer.tsx
//
// Per-student drill-in drawer (Phase 1 = completion). Slides in from the
// right; shows the student's headline figures + a unit-banded completion
// timeline (done / not done / locked per activity). This is the seed of the
// future per-student "360" view — kept completion-only for now.
//
// Serves both delivery units. On a SELF_PACED programme the headline swaps
// the pace status for the engagement status and adds the two facts that
// only exist per-student there: when they joined (their personal week 1)
// and how much access they have left. Nothing is locked in that mode — a
// self-paced student has had the whole curriculum since the day they
// bought it — so the timeline's locked branch simply never fires.

'use client';

import { useEffect } from 'react';
import { Avatar, EngagementPill, StatusPill, ScoreChip, ACTIVITY_META } from './atoms';
import type {
  ActivityAnalyticsRow,
  StudentAnalyticsRow,
  StudentQuizPerf,
} from './types';
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
  quizPerf,
  selfPaced = false,
  onClose,
}: {
  student: StudentAnalyticsRow;
  activities: ActivityAnalyticsRow[];
  unitLabel: UnitLabel;
  quizPerf: StudentQuizPerf | null;
  /** SELF_PACED — swaps the pace status for engagement + the own-clock facts. */
  selfPaced?: boolean;
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
              <div className="l">
                {student.doneCount} of {student.releasedCount}{' '}
                {selfPaced ? 'activities done' : 'released done'}
              </div>
            </div>
            <div className="s">
              {selfPaced ? (
                <EngagementPill
                  status={student.engagement ?? 'notstarted'}
                  endingSoon={student.endingSoon}
                />
              ) : (
                <StatusPill status={student.status} />
              )}
              <div className="l" style={{ marginTop: 6 }}>
                {student.lastActiveDays == null
                  ? 'No activity yet'
                  : student.lastActiveDays === 0
                    ? 'Active today'
                    : `Last active ${student.lastActiveDays}d ago`}
              </div>
            </div>
            {/* ⚠ This block used to be self-paced-only, on the assumption
                that "a cohort shares a start and an end date, so these
                would be the same for everybody there". The access half of
                that is FALSE: access is frozen per enrolment from the join
                date, so one cohort's members hold different end dates, and
                the cohort's end_date is a timetable that need not resemble
                any of them. Access therefore shows in both modes; only the
                JOIN anchor stays self-paced, because a cohort's shared
                calendar is what its pace status is measured against. */}
            <div className="s">
              {selfPaced && (
                <div className="l">
                  Joined{' '}
                  <b>
                    {student.joinedDays === 0
                      ? 'today'
                      : student.joinedDays === 1
                        ? 'yesterday'
                        : `${student.joinedDays} days ago`}
                  </b>
                </div>
              )}
              <div className="l" style={{ marginTop: selfPaced ? 6 : 0 }}>
                Access:{' '}
                <b>
                  {student.accessDaysLeft == null
                    ? 'lifetime'
                    : student.accessDaysLeft === 0
                      ? 'ends today'
                      : `${student.accessDaysLeft} days left`}
                </b>
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
                  const quizScore = meta.quiz && a.quizId ? quizPerf?.scores[a.quizId] : undefined;
                  return (
                    <div key={a.activityId} className={`an-tl-row ${done ? '' : 'is-todo'}`}>
                      <span className={`an-tl-check ${done ? 'done' : locked ? 'locked' : 'todo'}`}>
                        {done ? '✓' : locked ? '·' : ''}
                      </span>
                      <span className="t" title={meta.label}>{a.title}</span>
                      {quizScore && <ScoreChip score={quizScore.score} pass={quizScore.pass} />}
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
