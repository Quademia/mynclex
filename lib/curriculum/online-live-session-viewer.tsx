// mynclex/lib/curriculum/online-live-session-viewer.tsx
//
// Slice 10.3 — the Online live session activity viewer. Second of
// the per-type viewers; a modal, like External link, reusing
// <ViewerModalShell> and its shared .viewer-modal-* vocabulary.
//
// Shows the session's when + duration in the STUDENT's local zone
// (the tutor stored it as UTC), the provider, a primary "Join
// session" button, and the recording link once the tutor has
// added it. A simple status line — Upcoming / Happening now /
// Ended — tells the student at a glance whether the join link or
// the recording is the relevant one. It's derived from the start
// time + duration vs. now; no extra data, computed once when the
// modal opens.
//
// Renders entirely from the `activity` the list already loaded —
// no new query, no new route.

'use client';

import { ViewerModalShell } from './viewer-modal-shell';
import { providerLabelFor, safeHttpUrl } from './format';
import { MarkDoneButton } from '@/lib/progress/mark-done-button';
import type {
  ActivityPayloadOnlineLiveSession,
  StudentActivity,
} from './types';

type SessionStatus = 'UPCOMING' | 'LIVE' | 'ENDED';

const STATUS_LABEL: Record<SessionStatus, string> = {
  UPCOMING: 'Upcoming',
  LIVE: 'Happening now',
  ENDED: 'Ended',
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
  const joinUrl = safeHttpUrl(payload.join_url);
  const recordingUrl = safeHttpUrl(payload.recording_url);
  const provider = joinUrl
    ? providerLabelFor(new URL(joinUrl).hostname)
    : null;

  // scheduled_at is UTC ISO; the browser renders it in the
  // student's own zone. duration_minutes drives the end time.
  const start = payload.scheduled_at ? new Date(payload.scheduled_at) : null;
  const startValid = start !== null && !isNaN(start.getTime());
  const durationMin =
    typeof payload.duration_minutes === 'number' &&
    payload.duration_minutes > 0
      ? payload.duration_minutes
      : null;
  const end =
    startValid && durationMin
      ? new Date(start!.getTime() + durationMin * 60_000)
      : null;

  // Status — Upcoming / Happening now / Ended, snapshotted when
  // the modal opens. With no duration set, the end falls back to
  // the start instant (a session reads as Ended right after it
  // starts) — an acceptable edge for a session with no duration.
  let status: SessionStatus | null = null;
  if (startValid) {
    const now = Date.now();
    const startMs = start!.getTime();
    const endMs = end ? end.getTime() : startMs;
    if (now < startMs) status = 'UPCOMING';
    else if (now <= endMs) status = 'LIVE';
    else status = 'ENDED';
  }

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
          <p className="viewer-modal-broken">
            Session details aren&apos;t available yet — ask your tutor to
            check.
          </p>
        )}

        {joinUrl && (
          <a
            className="viewer-modal-cta"
            href={joinUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Join session ↗</span>
            {provider && (
              <span className="viewer-modal-cta-sub">{provider}</span>
            )}
          </a>
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

        {/* Mark-as-done gated on session status: marking attendance
            only makes sense after the session ends (Q2 of Slice 2).
            Disabled with a tooltip while UPCOMING or LIVE; enabled
            once status flips to ENDED. Status === null (no
            scheduled_at on the activity payload) leaves the button
            available since the gate has no meaning then. */}
        <MarkDoneButton
          activityId={activity.activity_id}
          isDone={activity.isDone}
          disabled={status === 'UPCOMING' || status === 'LIVE'}
          disabledReason={
            status === 'UPCOMING'
              ? 'Available after the session ends.'
              : status === 'LIVE'
              ? 'Available after the session ends.'
              : undefined
          }
        />
      </div>
    </ViewerModalShell>
  );
}
