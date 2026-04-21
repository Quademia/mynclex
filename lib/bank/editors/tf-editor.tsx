// mynclex/lib/bank/editors/tf-editor.tsx
//
// Type-specific UI for True/False authoring: exactly two locked options
// (A=True, B=False), single-correct radio selection. No add/remove
// buttons — the TF shape is fixed. Per-option feedback is still
// editable so curators can explain each choice.

'use client';

import { useState } from 'react';

const TF_OPTIONS = [
  { id: 'A', text: 'True' },
  { id: 'B', text: 'False' },
] as const;

export function TfEditor({
  initialFeedback,
  initialCorrectId,
}: {
  initialFeedback: Record<string, string>;
  initialCorrectId: string;
}) {
  const [feedback, setFeedback] = useState<Record<string, string>>(() => ({
    A: initialFeedback.A ?? '',
    B: initialFeedback.B ?? '',
  }));
  const [correctId, setCorrectId] = useState<string>(initialCorrectId);

  return (
    <div className="bank-fg">
      <div className="bank-label-row">
        <label className="bank-label">Options *</label>
      </div>
      <p className="bank-hint">True / False locked.</p>

      {TF_OPTIONS.map((opt) => (
        <div key={opt.id} className="bank-option-row">
          <div className="bank-option-correct">
            <input
              type="radio"
              name="correct_id"
              value={opt.id}
              checked={correctId === opt.id}
              onChange={() => setCorrectId(opt.id)}
              title="Mark as correct"
            />
          </div>
          <div className="bank-option-letter">{opt.id}</div>
          <div className="bank-option-fields">
            <input
              type="text"
              name="option_text"
              value={opt.text}
              readOnly
              className="bank-input"
            />
            <input
              type="text"
              name="option_feedback"
              value={feedback[opt.id] ?? ''}
              onChange={(e) =>
                setFeedback({ ...feedback, [opt.id]: e.target.value })
              }
              placeholder="Per-option feedback (optional)…"
              className="bank-input bank-input--sm"
            />
            <input type="hidden" name="option_id" value={opt.id} />
          </div>
        </div>
      ))}
    </div>
  );
}
