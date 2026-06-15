// mynclex/lib/curriculum/online-live-session-editor.tsx
//
// Online live session — the TEMPLATE marker editor (Slice 1b).
//
// A live session is an EVENT, not content: its date, join details,
// and recording are per-RUN, so they live on the cohort planner (the
// cohort Sessions tab), NOT on the shared template. The template
// activity is just a MARKER — title + position (from the shell) plus
// one optional design property here: a "typical duration" hint that
// pre-fills each cohort's schedule.
//
// See docs/product-plan/live-session-planner.md.

'use client';

import type { OnlineLiveSessionActivityBodyValues } from './types';

interface OnlineLiveSessionEditorProps {
  values: OnlineLiveSessionActivityBodyValues;
  onChange: (next: OnlineLiveSessionActivityBodyValues) => void;
  disabled?: boolean;
}

export function OnlineLiveSessionEditor({
  values,
  onChange,
  disabled = false,
}: OnlineLiveSessionEditorProps) {
  return (
    <div className="activity-editor-body">
      <div className="activity-marker-note">
        <span className="activity-marker-note-icon" aria-hidden="true">
          📅
        </span>
        <p>
          This is the live session as it appears in the curriculum. The{' '}
          <strong>date, join link, and recording are set per cohort</strong> on
          the cohort&apos;s <strong>Sessions</strong> tab — each run meets at its
          own time.
        </p>
      </div>

      <label className="prog-field">
        <span className="prog-field-label">Typical duration</span>
        <div className="activity-text-minutes-row">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            className="prog-input activity-text-minutes"
            value={values.typical_duration_minutes}
            onChange={(e) =>
              onChange({ ...values, typical_duration_minutes: e.target.value })
            }
            disabled={disabled}
            placeholder="—"
          />
          <span className="activity-text-minutes-suffix">minutes</span>
        </div>
        <span className="prog-field-help">
          Optional. A hint for how long these tutorials usually run — it
          pre-fills each cohort&apos;s schedule, where the tutor can override
          it.
        </span>
      </label>
    </div>
  );
}
