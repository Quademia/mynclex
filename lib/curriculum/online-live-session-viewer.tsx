// mynclex/lib/curriculum/online-live-session-viewer.tsx
//
// The Online live session activity viewer — a modal, like External
// link. Slice 1b: it reads the per-run schedule from this cohort's
// PLANNER row (activity.liveSession), not the template payload. The
// template only carries a "typical duration" hint (used as a fallback
// when the planner row has no duration). When the marker is
// unscheduled for the cohort, it shows "Date to be announced".
//
// A live session is an EVENT, not a task — there is no "mark as done"
// (it doesn't count toward progress in v1; attendance-derived
// completion comes later). See docs/product-plan/live-session-planner.md.

'use client';

import { useState } from 'react';
import { ViewerModalShell } from './viewer-modal-shell';
import { providerLabelFor, safeHttpUrl } from './format';
import type {
  ActivityPayloadOnlineLiveSession,
  LiveSessionPlatform,
  StudentActivity,
} from './types';

type SessionStatus = 'UPCOMING' | 'LIVE' | 'ENDED';

const STATUS_LABEL: Record<SessionStatus, string> = {
  UPCOMING: 'Upcoming',
  LIVE: 'Happening now',
  ENDED: 'Ended',
};

const PLATFORM_LABEL: Record<LiveSessionPlatform, string> = {
  ZOOM: 'Zoom',
  GOOGLE_MEET: 'Google Meet',
  MS_TEAMS: 'Microsoft Teams',
  OTHER: 'Other',
};

// "Wednesday, 20 May 2026, 17:00" — in the student's locale + zone.
function formatWhen(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OnlineLiveSessionViewer({
  activity,
  onClose,
}: {
  activity: StudentActivity;
  onClose: () => void;
}) {
  const payload = activity.payload as ActivityPayloadOnlineLiveSession;
  const schedule = activity.liveSession;

  const joinUrl = safeHttpUrl(schedule?.joinUrl ?? undefined);
  const recordingUrl = safeHttpUrl(schedule?.recordingUrl ?? undefined);
  const platformLabel = schedule?.platform
    ? PLATFORM_LABEL[schedule.platform]
    : joinUrl
      ? providerLabelFor(new URL(joinUrl).hostname)
      : null;

  // scheduled_at is UTC ISO; the browser renders it in the student's
  // own zone. Duration falls back from the planner override to the
  // marker's typical-duration hint.
  const start = schedule?.scheduledAt ? new Date(schedule.scheduledAt) : null;
  const startValid = start !== null && !isNaN(start.getTime());
  const durationMin =
    schedule?.durationMinutes != null && schedule.durationMinutes > 0
      ? schedule.durationMinutes
      : typeof payload.typical_duration_minutes === 'number' &&
          payload.typical_duration_minutes > 0
        ? payload.typical_duration_minutes
        : null;
  const end =
    startValid && durationMin
      ? new Date(start!.getTime() + durationMin * 60_000)
      : null;

  // Status — Upcoming / Happening now / Ended, snapshotted when the
  // modal opens. With no duration the end falls back to the start
  // instant (reads as Ended right after it starts).
  //
  // The snapshot is a lazy `useState` initialiser, which runs ONCE per mount.
  // It used to be a bare `Date.now()` in the render body — so despite what
  // this comment claimed, the clock was re-read on every re-render, and the
  // status could change under a student who had done nothing but resize the
  // window. Reading it once is what "snapshotted when the modal opens" was
  // always meant to say.
  const [now] = useState(() => Date.now());
  let status: SessionStatus | null = null;
  if (startValid) {
    const startMs = start!.getTime();
    const endMs = end ? end.getTime() : startMs;
    if (now < startMs) status = 'UPCOMING';
    else if (now <= endMs) status = 'LIVE';
    else status = 'ENDED';
  }

  const hasConnectionExtras =
    !!schedule?.meetingId || !!schedule?.passcode;

  return (
    <ViewerModalShell title={activity.title} onClose={onClose}>
      <div className="viewer-modal-content">
        {status && (
          <span
            className={`live-session-status live-session-status-${status.toLowerCase()}`}
          >
            {STATUS_LABEL[status]}
          </span>
        )}

        {activity.description && (
          <p className="viewer-modal-desc">{activity.description}</p>
        )}
        {activity.note && (
          <p className="viewer-modal-note">
            <strong>Note:</strong> {activity.note}
          </p>
        )}

        {startValid ? (
          <div className="live-session-when">
            <div className="live-session-when-date">{formatWhen(start!)}</div>
            <div className="live-session-when-meta">
              {durationMin != null && <span>{durationMin} min</span>}
              {end && <span>ends {formatTime(end)}</span>}
              <span className="live-session-when-tz">your local time</span>
            </div>
          </div>
        ) : (
          <div className="live-session-tba">
            <span aria-hidden="true">📅</span>
            <span>
              Date to be announced — your tutor will post the time here.
            </span>
          </div>
        )}

        {joinUrl && (
          <a
            className="viewer-modal-cta"
            href={joinUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Join session ↗</span>
            {platformLabel && (
              <span className="viewer-modal-cta-sub">{platformLabel}</span>
            )}
          </a>
        )}

        {hasConnectionExtras && (
          <dl className="live-session-connection">
            {schedule?.meetingId && (
              <div className="live-session-connection-row">
                <dt>Meeting ID</dt>
                <dd>{schedule.meetingId}</dd>
              </div>
            )}
            {schedule?.passcode && (
              <div className="live-session-connection-row">
                <dt>Passcode</dt>
                <dd>{schedule.passcode}</dd>
              </div>
            )}
          </dl>
        )}

        {schedule?.joiningInstructions && (
          <p className="live-session-instructions">
            {schedule.joiningInstructions}
          </p>
        )}

        {recordingUrl && (
          <a
            className="live-session-recording"
            href={recordingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Watch recording ↗
          </a>
        )}

        {/* No "mark as done" — a live session is an event, not a task,
            and does not count toward progress in v1 (the "only verified
            completion counts" rule). Completion will be DERIVED from
            tutor-marked attendance in a later slice, never self-marked.
            See docs/product-plan/live-session-planner.md. */}
      </div>
    </ViewerModalShell>
  );
}
