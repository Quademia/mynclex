// mynclex/lib/curriculum/text-editor.tsx
//
// Text-activity editor body. Just the type-specific fields that
// sit below the shared Title + Note divider in <ActivityModal>.
// Stateless about location — emits onChange for every keystroke;
// the parent (<ActivityModal>) holds the buffered value and runs
// the server action on Save.
//
// Slice 9.3b ships with a plain <textarea> for the body. Real
// rich-text formatting (H2/H3/B/I/lists/link/image) is deferred
// to a Phase B polish slice — the DB column is text-shaped
// either way, so a swap to a real RTE later is a UI change, not
// a schema migration.
//
// This is the first of six activity-type bodies. Each future
// type ships its own body component with this same shape: take
// `values` + `onChange` + `disabled`. The activity-modal shell
// dispatches on activity.type to render the right one.

'use client';

import type { TextActivityBodyValues } from './types';

interface TextEditorProps {
  values: TextActivityBodyValues;
  onChange: (next: TextActivityBodyValues) => void;
  disabled?: boolean;
}

export function TextEditor({
  values,
  onChange,
  disabled = false,
}: TextEditorProps) {
  return (
    <div className="activity-editor-body">
      <label className="prog-field">
        <span className="prog-field-label">Body</span>
        <textarea
          className="prog-input activity-text-body"
          rows={12}
          value={values.body}
          onChange={(e) =>
            onChange({ ...values, body: e.target.value })
          }
          disabled={disabled}
          placeholder="Write the note / reading content for this activity…"
        />
        <span className="prog-field-help">
          Plain text for now. Rich-text formatting (headings, bold,
          lists, links, images) comes in a later slice.
        </span>
      </label>

      <label className="prog-field">
        <span className="prog-field-label">Estimated reading time</span>
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
