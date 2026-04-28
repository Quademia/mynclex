// mynclex/lib/authoring/editors/mcq/preview.tsx
//
// MCQ preview pane — student-facing render of the current value.
// Curator-facing only; not the runner. No scoring, no answer tracking,
// no rationale-reveal logic. Just "what does this question look like
// when shown to a student".

'use client';

import type { McqValue } from './value';

export function McqPreview({ value }: { value: McqValue }) {
  return (
    <div className="aut-preview-card">
      {value.instruction.trim() && (
        <div className="aut-preview-instruction">{value.instruction}</div>
      )}
      <div className="aut-preview-stem">{value.stem}</div>
      <div className="aut-preview-options">
        {value.options.map((o) => (
          <div key={o.id} className="aut-preview-opt">
            {o.id}. {o.text}
          </div>
        ))}
      </div>
      <div className="aut-preview-rationale-section">
        <div className="aut-preview-rationale-label">Rationale (revealed after answer)</div>
        <div className="aut-preview-rationale-body">{value.rationale}</div>
        {value.rationaleImg.trim() && (
          <div className="aut-preview-rationale-img">{value.rationaleImg}</div>
        )}
      </div>
    </div>
  );
}
