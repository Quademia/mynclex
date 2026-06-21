// mynclex/lib/cohorts/live-session-add-modal.tsx
//
// The "+ Add session" one-off flow (Slice 2, Option B). A bonus live
// session for just this cohort, added in one step: title + which week +
// (optional) schedule. Behind the scenes it creates a COHORT-ONLY
// live-session marker AND its planner schedule row — the tutor never does
// double entry, and never picks "live session" in the cohort-only activity
// picker (the planner owns live-session creation). The new session appears
// in that week's curriculum AND in this list.
//
// Two server calls: createCohortOnlyLiveSessionAction (the marker, returns
// its id) then setLiveSessionScheduleAction (the schedule). Fields are
// validated client-side first, so a marker isn't created on a bad schedule.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { unitLabel } from '@/lib/curriculum/format';
import { ErrorToast } from '@/lib/toast/error-toast';
import { createCohortOnlyLiveSessionAction } from './actions';
import type { LiveSessionPlatform } from '@/lib/curriculum/types';
import type { PlannerUnit } from './live-session-queries';
import type { UnitLabel } from '@/lib/programmes/types';

const PLATFORM_OPTIONS: { value: LiveSessionPlatform; label: string }[] = [
  { value: 'ZOOM', label: 'Zoom' },
  { value: 'GOOGLE_MEET', label: 'Google Meet' },
  { value: 'MS_TEAMS', label: 'Microsoft Teams' },
  { value: 'OTHER', label: 'Other' },
];

export function LiveSessionAddModal({
  cohortId,
  units,
  unitLabelKind,
  onClose,
}: {
  cohortId: string;
  units: PlannerUnit[];
  unitLabelKind: UnitLabel;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [unitId, setUnitId] = useState(units[0]?.unitId ?? '');
  const [isPublished, setIsPublished] = useState(true);
  const [duration, setDuration] = useState('');
  const [when, setWhen] = useState('');
  const [platform, setPlatform] = useState<LiveSessionPlatform | ''>('');
  const [joinUrl, setJoinUrl] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [passcode, setPasscode] = useState('');
  const [instructions, setInstructions] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');

  function close() {
    if (!isPending) onClose();
  }

  function handleSave() {
    setError(null);
    const t = title.trim();
    if (t === '') {
      setError('Title is required.');
      return;
    }
    if (unitId === '') {
      setError('Pick a week for this session.');
      return;
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

    let scheduledIso: string | null = null;
    if (when.trim() !== '') {
      const d = new Date(when);
      if (isNaN(d.getTime())) {
        setError('Session date/time is not valid.');
        return;
      }
      scheduledIso = d.toISOString();
    }

    const hasSchedule =
      scheduledIso != null ||
      platform !== '' ||
      joinUrl.trim() !== '' ||
      meetingId.trim() !== '' ||
      passcode.trim() !== '' ||
      instructions.trim() !== '' ||
      recordingUrl.trim() !== '';

    startTransition(async () => {
      // ONE atomic call — the marker + its schedule are created together,
      // schedule validated first. On any error nothing is created and the
      // modal stays open with everything intact (so a bad URL is just an
      // inline fix, never lost input or an orphan unscheduled session).
      const created = await createCohortOnlyLiveSessionAction(cohortId, unitId, {
        title: t,
        typicalDurationMinutes: durationMinutes,
        isPublished,
        schedule: hasSchedule
          ? {
              scheduledAt: scheduledIso,
              durationMinutes: null, // falls back to the marker's typical duration
              platform: platform === '' ? null : platform,
              joinUrl: joinUrl.trim() || null,
              meetingId: meetingId.trim() || null,
              passcode: passcode.trim() || null,
              joiningInstructions: instructions.trim() || null,
              recordingUrl: recordingUrl.trim() || null,
            }
          : null,
      });
      if (!created.ok) {
        setError(created.error);
        return; // keep the modal open, fields untouched
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
        aria-label="Add a live session"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="prog-modal activity-modal">
          <header className="prog-modal-header">
            <h2 className="prog-modal-title">Add a live session</h2>
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
            <p className="cohort-sessions-add-modal-hint">
              A bonus session for <strong>this cohort only</strong>. It appears
              in the chosen week&apos;s curriculum and in this list. You can
              leave the schedule blank for now and fill it in later.
            </p>

            <div className="ls-field-grid">
              <label className="prog-field">
                <span className="prog-field-label">
                  Title <span className="prog-required">*</span>
                </span>
                <input
                  type="text"
                  className="prog-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isPending}
                  autoFocus
                  placeholder="e.g. Extra Q&amp;A session"
                />
              </label>

              <label className="prog-field">
                <span className="prog-field-label">
                  Week <span className="prog-required">*</span>
                </span>
                <select
                  className="prog-input"
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  disabled={isPending}
                >
                  {units.map((u) => (
                    <option key={u.unitId} value={u.unitId}>
                      {unitLabel(u.unitIndex, unitLabelKind)}
                      {u.title ? ` — ${u.title}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="prog-field">
              <span className="prog-field-label">Status</span>
              <label className="prog-toggle prog-toggle-inline">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  disabled={isPending}
                />
                <span>Live — students in this cohort can see it</span>
              </label>
              <span className="prog-field-help">
                Off → Draft (hidden from students until you set it Live).
              </span>
            </div>

            <div className="activity-modal-divider" />

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
                  Optional. Saved as UTC, shown to students in their zone.
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
            </label>
          </div>

          <footer className="prog-modal-footer">
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
              disabled={isPending || title.trim() === '' || unitId === ''}
            >
              {isPending ? 'Adding…' : 'Add session'}
            </button>
          </footer>
        </div>
      </div>

      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </>
  );
}
