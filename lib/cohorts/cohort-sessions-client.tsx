// mynclex/lib/cohorts/cohort-sessions-client.tsx
//
// Client island for the cohort Live Session Planner (Slice 1b). Renders
// one row per live-session marker in the curriculum with its scheduled /
// unscheduled state, and owns the schedule-editor modal's open state.
// The marker data is server-fetched (getCohortSessionsPlanner) and
// passed in as plain serialisable values.

'use client';

import { useState } from 'react';
import { unitLabel } from '@/lib/curriculum/format';
import { LiveSessionScheduleModal } from './live-session-schedule-modal';
import type {
  CohortSessionsPlanner,
  PlannerSession,
} from './live-session-queries';
import type { UnitLabel } from '@/lib/programmes/types';

// "Wednesday, 3 July 2026, 19:00" — in the tutor's locale + zone.
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const PLATFORM_LABEL: Record<string, string> = {
  ZOOM: 'Zoom',
  GOOGLE_MEET: 'Google Meet',
  MS_TEAMS: 'Microsoft Teams',
  OTHER: 'Other',
};

export function CohortSessionsClient({
  planner,
  cohortId,
  unitLabelKind,
}: {
  planner: CohortSessionsPlanner;
  cohortId: string;
  unitLabelKind: UnitLabel;
}) {
  const [editing, setEditing] = useState<PlannerSession | null>(null);

  return (
    <>
      <ul className="cohort-sessions-list">
        {planner.sessions.map((s) => {
          const isScheduled = s.schedule?.scheduledAt != null;
          return (
            <li key={s.activityId} className="cohort-session-row">
              <div className="cohort-session-main">
                <div className="cohort-session-meta">
                  <span className="cohort-session-week">
                    {unitLabel(s.unitIndex, unitLabelKind)}
                  </span>
                  {s.isCohortOnly && (
                    <span className="cohort-session-tag">Cohort-only</span>
                  )}
                </div>
                <h3 className="cohort-session-title">{s.title}</h3>

                {isScheduled ? (
                  <div className="cohort-session-when">
                    <span className="cohort-session-when-date">
                      {formatWhen(s.schedule!.scheduledAt!)}
                    </span>
                    {s.schedule!.platform && (
                      <span className="cohort-session-chip">
                        {PLATFORM_LABEL[s.schedule!.platform] ??
                          s.schedule!.platform}
                      </span>
                    )}
                    {s.schedule!.recordingUrl && (
                      <span className="cohort-session-chip">Recording added</span>
                    )}
                  </div>
                ) : (
                  <div className="cohort-session-unscheduled">
                    Not scheduled yet
                  </div>
                )}
              </div>

              <div className="cohort-session-actions">
                <span
                  className={
                    isScheduled
                      ? 'cohort-session-status is-scheduled'
                      : 'cohort-session-status is-unscheduled'
                  }
                >
                  {isScheduled ? 'Scheduled' : 'Unscheduled'}
                </span>
                <button
                  type="button"
                  className="prog-btn prog-btn-ghost"
                  onClick={() => setEditing(s)}
                >
                  {s.schedule ? 'Edit' : 'Schedule'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {editing && (
        <LiveSessionScheduleModal
          cohortId={cohortId}
          markerActivityId={editing.activityId}
          title={editing.title}
          schedule={editing.schedule}
          typicalDurationMinutes={editing.typicalDurationMinutes}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
