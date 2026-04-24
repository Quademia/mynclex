// mynclex/lib/bank/editors/mcq-editor.tsx
//
// Type-specific UI for MCQ authoring: variable-length option list (A–F),
// single-correct radio selection, per-option feedback input. Lives
// inside the parent <form> rendered by EditorShell, so every input's
// `name=` attribute flows straight into the Server Action FormData.

'use client';

import { useState } from 'react';
import {
  OPTION_LETTERS,
  MIN_OPTIONS,
  MAX_OPTIONS,
  DEFAULT_OPTIONS,
} from '../classifications';
import { makePrefixer } from '../field-prefix';

interface OptionRow {
  id: string;
  text: string;
  feedback: string;
}

export function McqEditor({
  initialOptions,
  initialCorrectId,
  fieldPrefix = '',
}: {
  initialOptions: OptionRow[];
  initialCorrectId: string;
  fieldPrefix?: string;
}) {
  const fn = makePrefixer(fieldPrefix);
  const [options, setOptions] = useState<OptionRow[]>(() =>
    initialOptions.length > 0 ? initialOptions : defaultRows(),
  );
  const [correctId, setCorrectId] = useState<string>(initialCorrectId);

  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    const nextLetter = OPTION_LETTERS[options.length];
    setOptions([...options, { id: nextLetter, text: '', feedback: '' }]);
  }

  function removeOption(idx: number) {
    if (options.length <= MIN_OPTIONS) return;
    const removedId = options[idx].id;
    setOptions(options.filter((_, i) => i !== idx));
    if (correctId === removedId) setCorrectId('');
  }

  function updateText(idx: number, text: string) {
    setOptions(options.map((o, i) => (i === idx ? { ...o, text } : o)));
  }

  function updateFeedback(idx: number, feedback: string) {
    setOptions(options.map((o, i) => (i === idx ? { ...o, feedback } : o)));
  }

  return (
    <div className="bank-fg">
      <div className="bank-label-row">
        <label className="bank-label">Options *</label>
        <button
          type="button"
          className="bank-link-btn"
          onClick={addOption}
          disabled={options.length >= MAX_OPTIONS}
        >
          + Add option
        </button>
      </div>
      <p className="bank-hint">Mark one correct option.</p>

      {options.map((opt, idx) => (
        <div key={opt.id} className="bank-option-row">
          <div className="bank-option-correct">
            <input
              type="radio"
              name={fn('correct_id')}
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
              name={fn('option_text')}
              value={opt.text}
              onChange={(e) => updateText(idx, e.target.value)}
              placeholder={`Option ${opt.id} text…`}
              className="bank-input"
            />
            <input
              type="text"
              name={fn('option_feedback')}
              value={opt.feedback}
              onChange={(e) => updateFeedback(idx, e.target.value)}
              placeholder="Per-option feedback (optional)…"
              className="bank-input bank-input--sm"
            />
            <input type="hidden" name={fn('option_id')} value={opt.id} />
          </div>
          <button
            type="button"
            className="bank-row-remove"
            onClick={() => removeOption(idx)}
            disabled={options.length <= MIN_OPTIONS}
            title="Remove option"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function defaultRows(): OptionRow[] {
  return Array.from({ length: DEFAULT_OPTIONS }, (_, i) => ({
    id: OPTION_LETTERS[i],
    text: '',
    feedback: '',
  }));
}
