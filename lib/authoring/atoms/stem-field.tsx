// mynclex/lib/authoring/atoms/stem-field.tsx
//
// The "Stem *" textarea. Controlled because the live preview reads
// from the same state on every keystroke. id="bank-stem" is preserved
// from the legacy editors so future Cloze/Highlight/Drag-drop work
// can read marker positions from the DOM if needed.

'use client';

interface StemFieldProps {
  value: string;
  onChange: (next: string) => void;
  /** Form-data field name (default: 'stem'). */
  name?: string;
}

export function StemField({ value, onChange, name = 'stem' }: StemFieldProps) {
  return (
    <div className="auth-fg">
      <label htmlFor="bank-stem" className="auth-label">Stem *</label>
      <textarea
        id="bank-stem"
        name={name}
        rows={4}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter the full question text…"
        className="auth-input"
      />
    </div>
  );
}
