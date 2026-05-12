// mynclex/lib/curriculum/online-live-session-editor.tsx
//
// Online live session body — four type-specific fields below the
// shared Title/Description/Note shell in <ActivityModal>:
//
//   • When — `datetime-local` input in the tutor's browser-local
//     time. The modal parses this to UTC ISO on save (and back
//     to local for the input value on edit). Italic help line
//     reminds the tutor that students see it in their own zone.
//     End-time chip auto-derived from When + Duration.
//
//   • Duration — minutes (positive integer).
//
//   • Join URL — meeting link (Zoom, Meet, Teams, etc.). Provider
//     chip auto-derived from the URL host.
//
//   • Recording URL — optional, always visible. Tutor fills after
//     the session airs.
//
// Stateless about transitions — onChange fires for every
// keystroke; the parent modal holds the buffer + runs the
// server action on Save.

'use client';

import type { OnlineLiveSessionActivityBodyValues } from './types';

interface OnlineLiveSessionEditorProps {
  values: OnlineLiveSessionActivityBodyValues;
  onChange: (next: OnlineLiveSessionActivityBodyValues) => void;
  disabled?: boolean;
}

// Cheap URL parse for the provider chip. Returns null on
// non-parseable input.
function safeParse(value: string): URL | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

// Map a host to a short provider label. Falls back to the host
// itself for unknown providers. Lowercased contains-check covers
// regional Zoom domains (us02web.zoom.us, etc.) and Meet variants.
function providerLabelFor(host: string): string {
  const h = host.toLowerCase();
  if (h.includes('zoom.us')) return 'Zoom';
  if (h.includes('meet.google.com')) return 'Google Meet';
  if (h.includes('teams.microsoft.com') || h.includes('teams.live.com'))
    return 'Microsoft Teams';
  if (h.includes('webex.com')) return 'Webex';
  if (h.includes('whereby.com')) return 'Whereby';
  return host.replace(/^www\./, '');
}

// Format the tutor's local TZ as a short label (e.g.,
// "Africa/Accra · GMT+0"). Browser-provided; not stored anywhere.
function localTzLabel(): string {
  let tz = 'local';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  } catch {
    // Older browsers — fall back silently.
  }
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const hh = Math.floor(absMin / 60);
  const mm = absMin % 60;
  const offset = mm === 0 ? `GMT${sign}${hh}` : `GMT${sign}${hh}:${String(mm).padStart(2, '0')}`;
  return `${tz} · ${offset}`;
}

// Derive the end-time chip from start + duration. Returns null
// when either input is incomplete or malformed.
function formatEndTime(scheduledLocal: string, durationStr: string): string | null {
  if (!scheduledLocal) return null;
  const dur = parseInt(durationStr, 10);
  if (!Number.isFinite(dur) || dur <= 0) return null;
  const start = new Date(scheduledLocal);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + dur * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

export function OnlineLiveSessionEditor({
  values,
  onChange,
  disabled = false,
}: OnlineLiveSessionEditorProps) {
  const joinParsed = safeParse(values.join_url);
  const joinProvider = joinParsed ? providerLabelFor(joinParsed.hostname) : null;

  const recParsed = safeParse(values.recording_url);
  const recProvider = recParsed ? providerLabelFor(recParsed.hostname) : null;

  const endTime = formatEndTime(values.scheduled_at, values.duration_minutes);
  const tzLabel = localTzLabel();

  return (
    <div className="activity-editor-body">
      <label className="prog-field">
        <span className="prog-field-label">
          When <span className="prog-required">*</span>
        </span>
        <div className="activity-when-row">
          <input
            type="datetime-local"
            className="prog-input activity-when-input"
            value={values.scheduled_at}
            onChange={(e) =>
              onChange({ ...values, scheduled_at: e.target.value })
            }
            disabled={disabled}
          />
          {endTime && (
            <span className="activity-url-chip" aria-label="End time">
              Ends {endTime} (your time)
            </span>
          )}
        </div>
        <span className="prog-field-help">
          {tzLabel} — saved as UTC, shown to students in their zone.
        </span>
      </label>

      <label className="prog-field">
        <span className="prog-field-label">
          Duration <span className="prog-required">*</span>
        </span>
        <div className="activity-text-minutes-row">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            className="prog-input activity-text-minutes"
            value={values.duration_minutes}
            onChange={(e) =>
              onChange({ ...values, duration_minutes: e.target.value })
            }
            disabled={disabled}
            placeholder="—"
          />
          <span className="activity-text-minutes-suffix">minutes</span>
        </div>
      </label>

      <label className="prog-field">
        <span className="prog-field-label">
          Join URL <span className="prog-required">*</span>
        </span>
        <input
          type="url"
          inputMode="url"
          className="prog-input"
          value={values.join_url}
          onChange={(e) => onChange({ ...values, join_url: e.target.value })}
          disabled={disabled}
          placeholder="https://…"
        />
        <div className="activity-url-affordances">
          {joinProvider && (
            <span className="activity-url-chip" aria-label="Provider">
              {joinProvider}
            </span>
          )}
          {joinParsed && (joinParsed.protocol === 'http:' || joinParsed.protocol === 'https:') && (
            <a
              className="activity-url-open"
              href={joinParsed.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              Test link in new tab ↗
            </a>
          )}
        </div>
      </label>

      <label className="prog-field">
        <span className="prog-field-label">Recording URL</span>
        <input
          type="url"
          inputMode="url"
          className="prog-input"
          value={values.recording_url}
          onChange={(e) =>
            onChange({ ...values, recording_url: e.target.value })
          }
          disabled={disabled}
          placeholder="https://…"
        />
        <div className="activity-url-affordances">
          {recProvider && (
            <span className="activity-url-chip" aria-label="Provider">
              {recProvider}
            </span>
          )}
          {recParsed && (recParsed.protocol === 'http:' || recParsed.protocol === 'https:') && (
            <a
              className="activity-url-open"
              href={recParsed.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open recording in new tab ↗
            </a>
          )}
        </div>
        <span className="prog-field-help">Optional. Fill in after the session airs.</span>
      </label>
    </div>
  );
}
