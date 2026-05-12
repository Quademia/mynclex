// mynclex/lib/curriculum/external-link-editor.tsx
//
// External link body — type-specific fields below the shared
// Title/Description/Note shell in <ActivityModal>. Two real
// fields (URL + estimated time) plus two passive affordances
// on the URL row: an auto-derived domain chip and a click-to-
// open anchor for the tutor to sanity-check what they pasted.
//
// Stateless about transitions — onChange fires for every
// keystroke; the parent modal holds the buffer + runs the
// server action on Save.

'use client';

import type { ExternalLinkActivityBodyValues } from './types';

interface ExternalLinkEditorProps {
  values: ExternalLinkActivityBodyValues;
  onChange: (next: ExternalLinkActivityBodyValues) => void;
  disabled?: boolean;
}

// Cheap URL parse for the domain chip + "open in new tab" anchor.
// Returns null when the value isn't a parseable URL — used to gate
// affordances, not to validate (server is authoritative).
function safeParse(value: string): URL | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

export function ExternalLinkEditor({
  values,
  onChange,
  disabled = false,
}: ExternalLinkEditorProps) {
  const parsed = safeParse(values.url);
  const domain = parsed?.hostname.replace(/^www\./, '') ?? null;
  const isHttp = parsed?.protocol === 'http:' || parsed?.protocol === 'https:';

  return (
    <div className="activity-editor-body">
      <label className="prog-field">
        <span className="prog-field-label">
          URL <span className="prog-required">*</span>
        </span>
        <input
          type="url"
          inputMode="url"
          className="prog-input"
          value={values.url}
          onChange={(e) => onChange({ ...values, url: e.target.value })}
          disabled={disabled}
          placeholder="https://…"
        />
        <div className="activity-url-affordances">
          {domain && (
            <span className="activity-url-chip" aria-label="Domain">
              {domain}
            </span>
          )}
          {parsed && isHttp && (
            <a
              className="activity-url-open"
              href={parsed.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open link in new tab ↗
            </a>
          )}
        </div>
        <span className="prog-field-help">
          The destination opens in a new tab for the student.
        </span>
      </label>

      <label className="prog-field">
        <span className="prog-field-label">Estimated time</span>
        <div className="activity-text-minutes-row">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            className="prog-input activity-text-minutes"
            value={values.estimated_minutes}
            onChange={(e) =>
              onChange({ ...values, estimated_minutes: e.target.value })
            }
            disabled={disabled}
            placeholder="—"
          />
          <span className="activity-text-minutes-suffix">minutes</span>
        </div>
        <span className="prog-field-help">Optional. Shown on the student card.</span>
      </label>
    </div>
  );
}
