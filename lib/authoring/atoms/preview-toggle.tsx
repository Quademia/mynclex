// mynclex/lib/authoring/atoms/preview-toggle.tsx
//
// Shared two-pill toggle that sits at the top-right of an
// auth-preview-card header. Lets the curator flip between two views
// of the same question:
//
//   - student     : what the student sees pre-submit (no answers).
//   - answer-key  : the correct picks rendered visibly (curator view).
//
// Each editor owns the state via useState and passes value+onChange
// down into its preview component, which renders this toggle inside
// its own header.
//
// Slice 7 introduces this for BOWTIE only. The other editors
// (MCQ/TF/SATA/SELECT_N/MATRIX) still render single-mode previews
// and will be migrated in a follow-up slice.

'use client';

import type { KeyboardEvent } from 'react';

export type PreviewViewMode = 'student' | 'answer-key';

interface PreviewToggleProps {
  value: PreviewViewMode;
  onChange: (next: PreviewViewMode) => void;
}

export function PreviewToggle({ value, onChange }: PreviewToggleProps) {
  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(value === 'student' ? 'answer-key' : 'student');
    }
  }

  return (
    <div
      className="auth-preview-toggle"
      role="tablist"
      aria-label="Preview view mode"
      onKeyDown={handleKey}
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'student'}
        className={
          'auth-preview-toggle-pill' +
          (value === 'student' ? ' auth-preview-toggle-pill-active' : '')
        }
        onClick={() => onChange('student')}
      >
        Student
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'answer-key'}
        className={
          'auth-preview-toggle-pill' +
          (value === 'answer-key' ? ' auth-preview-toggle-pill-active' : '')
        }
        onClick={() => onChange('answer-key')}
      >
        Answer key
      </button>
    </div>
  );
}
