// mynclex/lib/curriculum/student-curriculum-shell.tsx
//
// Student curriculum — the view shell (Month view, Slice 2). Wraps the
// existing Weeks/Modules two-pane with a "{Weeks} | Month" toggle and
// switches between it and the CD "Programme schedule" Month view. Only
// mounted in a cohort context (tutor-led) — self-paced has no timeline,
// so the server viewer renders the plain header + body without this shell.
//
// Tap-to-launch reuses the ONE launch path: each OPEN chip is rendered as
// an <ActivityAction asChip> trigger (a LIBRARY_NOTE is a Link, every
// other type opens its viewer). Locked/closed chips render plain (not
// launchable). "Weeks" stays the default — the existing surface untouched.

'use client';

import { useMemo, useState } from 'react';
import { ActivityAction } from './activity-action';
import { CurriculumMonthView, type MonthWeek } from './month-view';
import type { StudentActivity } from './types';

interface Props {
  /** Wrapper gets `is-pane` only in Weeks view (the fixed-height frame);
   *  Month view scrolls the page. */
  isPane: boolean;
  /** "Weeks" / "Modules" — the toggle's first button + page copy. */
  unitNoun: 'Weeks' | 'Modules';
  cohortName: string | null;
  /** The existing Weeks body (single section / two-pane), server-rendered. */
  weeksBody: React.ReactNode;
  monthWeeks: MonthWeek[];
  /** Every activity shown — chip.id → activity for the launch trigger. */
  activities: StudentActivity[];
  libraryBasePath: string;
  rangeLabel: string;
}

export function StudentCurriculumShell({
  isPane,
  unitNoun,
  cohortName,
  weeksBody,
  monthWeeks,
  activities,
  libraryBasePath,
  rangeLabel,
}: Props) {
  const [view, setView] = useState<'weeks' | 'month'>('weeks');
  const byId = useMemo(
    () => new Map(activities.map((a) => [a.activity_id, a])),
    [activities]
  );
  const noun = unitNoun === 'Modules' ? 'module' : 'week';

  return (
    <div
      className={
        'student-curriculum' +
        (view === 'weeks' && isPane ? ' is-pane' : '') +
        (view === 'month' ? ' is-month' : '')
      }
    >
      <header className="student-curriculum-head">
        <div className="student-curriculum-head-text">
          <h1 className="student-curriculum-title">Curriculum</h1>
          <p className="student-curriculum-sub">
            Work through each {noun} — your progress saves as you go.
            {cohortName ? ` Cohort: ${cohortName}.` : null}
          </p>
        </div>
        <div
          className="cmv-toggle"
          role="tablist"
          aria-label="Curriculum view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === 'weeks'}
            className={'cmv-toggle-btn' + (view === 'weeks' ? ' is-on' : '')}
            onClick={() => setView('weeks')}
          >
            {unitNoun}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'month'}
            className={'cmv-toggle-btn' + (view === 'month' ? ' is-on' : '')}
            onClick={() => setView('month')}
          >
            Month
          </button>
        </div>
      </header>

      {view === 'weeks' ? (
        weeksBody
      ) : (
        <CurriculumMonthView
          weeks={monthWeeks}
          rangeLabel={rangeLabel}
          audience="student"
          renderChip={({ chip, className, inner }) => {
            // Locked / closed → not launchable; render plain.
            const a = chip.variant === 'locked' ? undefined : byId.get(chip.id);
            if (!a) {
              return (
                <div className={className} title={chip.title}>
                  {inner}
                </div>
              );
            }
            return (
              <ActivityAction
                activity={a}
                libraryBasePath={libraryBasePath}
                asChip={{ className, children: inner, title: chip.title }}
              />
            );
          }}
        />
      )}
    </div>
  );
}
