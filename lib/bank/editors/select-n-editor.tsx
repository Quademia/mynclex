// mynclex/lib/bank/editors/select-n-editor.tsx
//
// Type-specific UI for Select-N authoring: variable-length option list,
// multi-correct checkbox selection, AND a numeric "Select exactly N"
// field that bounds how many options students must pick.

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

export function SelectNEditor({
  initialOptions,
  initialCorrectIds,
  initialSelectCount,
  fieldPrefix = '',
}: {
  initialOptions: OptionRow[];
  initialCorrectIds: string[];
  initialSelectCount: number;
  fieldPrefix?: string;
}) {
  const fn = makePrefixer(fieldPrefix);
  const [options, setOptions] = useState<OptionRow[]>(() =>
    initialOptions.length > 0 ? initialOptions : defaultRows(),
  );
  const [correctIds, setCorrectIds] = useState<Set<string>>(
    () => new Set(initialCorrectIds),
  );
  const [selectCount, setSelectCount] = useState<number>(initialSelectCount);

  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    const nextLetter = OPTION_LETTERS[options.length];
    setOptions([...options, { id: nextLetter, text: '', feedback: '' }]);
  }

  function removeOption(idx: number) {
    if (options.length <= MIN_OPTIONS) return;
    const removedId = options[idx].id;
    setOptions(options.filter((_, i) => i !== idx));
    if (correctIds.has(removedId)) {
      const newSet = new Set(correctIds);
      newSet.delete(removedId);
      setCorrectIds(newSet);
    }
  }

  function updateText(idx: number, text: string) {
    setOptions(options.map((o, i) => (i === idx ? { ...o, text } : o)));
  }

  function updateFeedback(idx: number, feedback: string) {
    setOptions(options.map((o, i) => (i === idx ? { ...o, feedback } : o)));
  }

  function toggleCorrect(id: string) {
    const newSet = new Set(correctIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setCorrectIds(newSet);
  }

  return (
    <>
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
        <p className="bank-hint">Tick exactly {selectCount} correct options.</p>

        {options.map((opt, idx) => (
          <div key={opt.id} className="bank-option-row">
            <div className="bank-option-correct">
              <input
                type="checkbox"
                name={fn('correct_id')}
                value={opt.id}
                checked={correctIds.has(opt.id)}
                onChange={() => toggleCorrect(opt.id)}
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

      <div className="bank-fg">
        <label htmlFor="select_count" className="bank-label">Select exactly *</label>
        <input
          id="select_count"
          name={fn('select_count')}
          type="number"
          min={1}
          max={options.length}
          value={selectCount}
          onChange={(e) => setSelectCount(parseInt(e.target.value, 10) || 1)}
          className="bank-input bank-input--num"
        />
        <p className="bank-hint">Students must pick exactly this many options.</p>
      </div>
    </>
  );
}

function defaultRows(): OptionRow[] {
  return Array.from({ length: DEFAULT_OPTIONS }, (_, i) => ({
    id: OPTION_LETTERS[i],
    text: '',
    feedback: '',
  }));
}
