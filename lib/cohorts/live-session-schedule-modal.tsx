// mynclex/lib/cohorts/live-session-schedule-modal.tsx
//
// The per-cohort schedule editor for a live-session marker (Slice 1b).
// Reworked connection fields (vs the old single join_url): platform +
// join URL + meeting ID + passcode + free-text joining instructions,
// plus date/time, duration, and recording URL. Everything is optional
// so a tutor can fill the schedule incrementally; the integrity cue for
// "included but unscheduled" lands in a later slice.
//
// Reuses the prog-modal-* shell (same as ActivityModal). The tutor's
// datetime-local input is converted to UTC ISO before the action; the
// student viewer renders it back in their own zone.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorToast } from '@/lib/toast/error-toast';
import {
  setLiveSessionScheduleAction,
  clearLiveSessionScheduleAction,
} from './live-session-actions';
import type {
  LiveSessionPlatform,
  LiveSessionSchedule,
} from '@/lib/curriculum/types';

const PLATFORM_OPTIONS: { value: LiveSessionPlatform; label: string }[] = [
  { value: 'ZOOM', label: 'Zoom' },
  { value: 'GOOGLE_MEET', label: 'Google Meet' },
  { value: 'MS_TEAMS', label: 'Microsoft Teams' },
  { value: 'OTHER', label: 'Other' },
];

// UTC ISO → local "YYYY-MM-DDTHH:MM" for the datetime-local input.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export function LiveSessionScheduleModal({
  cohortId,
  markerActivityId,
  title,
  schedule,
  typicalDurationMinutes,
  onClose,
}: {
  cohortId: string;
  markerActivityId: string;
  title: string;
  schedule: LiveSessionSchedule | null;
  typicalDurationMinutes: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [when, setWhen] = useState(
    isoToLocalInput(schedule?.scheduledAt ?? null)
  );
  const [duration, setDuration] = useState(
    schedule?.durationMinutes != null
      ? String(schedule.durationMinutes)
      : typicalDurationMinutes != null
        ? String(typicalDurationMinutes)
        : ''
  );
  const [platform, setPlatform] = useState<LiveSessionPlatform | ''>(
    schedule?.platform ?? ''
  );
  const [joinUrl, setJoinUrl] = useState(schedule?.joinUrl ?? '');
  const [meetingId, setMeetingId] = useState(schedule?.meetingId ?? '');
  const [passcode, setPasscode] = useState(schedule?.passcode ?? '');
  const [instructions, setInstructions] = useState(
    schedule?.joiningInstructions ?? ''
  );
  const [recordingUrl, setRecordingUrl] = useState(schedule?.recordingUrl ?? '');

  const hasSchedule = schedule != null;

  function close() {
    if (!isPending) onClose();
  }

  function handleSave() {
    setError(null);

    let scheduledIso: string | null = null;
    if (when.trim() !== '') {
      const d = new Date(when);
      if (isNaN(d.getTime())) {
        setError('Session date/time is not valid.');
        return;
      }
      scheduledIso = d.toISOString();
    }

    const durTrim = duration.trim();
    let durationMinutes: number | null = null;
    if (durTrim !== '') {
      const n = parseInt(durTrim, 10);
      if (!Number.isInteger(n) || n < 1) {
        setError('Duration must be a positive number, or blank.');
        return;
      }
      durationMinutes = n;
    }

    startTransition(async () => {
      const res = await setLiveSessionScheduleAction(cohortId, markerActivityId, {
        scheduledAt: scheduledIso,
        durationMinutes,
        platform: platform === '' ? null : platform,
        joinUrl: joinUrl.trim() || null,
        meetingId: meetingId.trim() || null,
        passcode: passcode.trim() || null,
        joiningInstructions: instructions.trim() || null,
        recordingUrl: recordingUrl.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function handleClear() {
    setError(null);
    startTransition(async () => {
      const res = await clearLiveSessionScheduleAction(cohortId, markerActivityId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <>
      <div
        className="prog-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={`Schedule ${title}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="prog-modal activity-modal">
          <header className="prog-modal-header">
            <h2 className="prog-modal-title">Schedule · {title}</h2>
            <button
              type="button"
              className="prog-modal-close"
              aria-label="Close"
              onClick={close}
              disabled={isPending}
            >
              ✕
            </button>
          </header>

          <div className="prog-modal-body activity-modal-body">
            <p className="ls-modal-intro">
              This schedule applies to <strong>this cohort only</strong>.
              Students see the time in their own zone.
            </p>

            <div className="ls-field-grid">
              <label className="prog-field">
                <span className="prog-field-label">Date &amp; time</span>
                <input
                  type="datetime-local"
                  className="prog-input"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  disabled={isPending}
                />
                <span className="prog-field-help">
                  Saved as UTC, shown to students in their zone.
                </span>
              </label>

              <label className="prog-field">
                <span className="prog-field-label">Duration</span>
                <div className="activity-text-minutes-row">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    className="prog-input activity-text-minutes"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    disabled={isPending}
                    placeholder="—"
                  />
                  <span className="activity-text-minutes-suffix">minutes</span>
                </div>
              </label>
            </div>

            <label className="prog-field">
              <span className="prog-field-label">Platform</span>
              <select
                className="prog-input"
                value={platform}
                onChange={(e) =>
                  setPlatform(e.target.value as LiveSessionPlatform | '')
                }
                disabled={isPending}
              >
                <option value="">— Select —</option>
                {PLATFORM_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="prog-field">
              <span className="prog-field-label">Join URL</span>
              <input
                type="url"
                inputMode="url"
                className="prog-input"
                value={joinUrl}
                onChange={(e) => setJoinUrl(e.target.value)}
                disabled={isPending}
                placeholder="https://…"
              />
            </label>

            <div className="ls-field-grid">
              <label className="prog-field">
                <span className="prog-field-label">Meeting ID</span>
                <input
                  type="text"
                  className="prog-input"
                  value={meetingId}
                  onChange={(e) => setMeetingId(e.target.value)}
                  disabled={isPending}
                  placeholder="Optional"
                />
              </label>

              <label className="prog-field">
                <span className="prog-field-label">Passcode</span>
                <input
                  type="text"
                  className="prog-input"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  disabled={isPending}
                  placeholder="Optional"
                />
              </label>
            </div>

            <label className="prog-field">
              <span className="prog-field-label">Joining instructions</span>
              <textarea
                className="prog-input"
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                disabled={isPending}
                placeholder="Optional. Dial-in, waiting-room notes, etc."
              />
            </label>

            <label className="prog-field">
              <span className="prog-field-label">Recording URL</span>
              <input
                type="url"
                inputMode="url"
                className="prog-input"
                value={recordingUrl}
                onChange={(e) => setRecordingUrl(e.target.value)}
                disabled={isPending}
                placeholder="https://…"
              />
              <span className="prog-field-help">
                Optional. Add after the session airs.
              </span>
            </label>
          </div>

          <footer className="prog-modal-footer">
            {hasSchedule && (
              <button
                type="button"
                className="prog-btn prog-btn-ghost ls-clear-btn"
                onClick={handleClear}
                disabled={isPending}
              >
                Clear schedule
              </button>
            )}
            <button
              type="button"
              className="prog-btn prog-btn-ghost"
              onClick={close}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="prog-btn prog-btn-primary"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending ? 'Saving…' : 'Save schedule'}
            </button>
          </footer>
        </div>
      </div>

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
