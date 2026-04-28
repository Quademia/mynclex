// mynclex/lib/authoring/atoms/question-type-picker.tsx
//
// Small modal that lets the curator pick which of the 9 question
// types they want to author. Used by the bank-list "+ New question"
// flow and by the wrapper-page "+ Add question" flow (slices 11–12).
//
// Slice 2: only MCQ is enabled. The other 8 types render disabled
// with a subtle "coming soon" hint — they become clickable as their
// editors land in slices 3–10.

'use client';

import { useEffect } from 'react';
import { QUESTION_TYPES, type QuestionType } from '@/lib/authoring/classifications';

/** Types that have a working editor in lib/authoring/editors/. */
const ENABLED_TYPES: ReadonlySet<QuestionType> = new Set(['MCQ', 'TF']);

interface QuestionTypePickerProps {
  /** Closes the picker without choosing a type. */
  onClose: () => void;
  /** Called with the chosen type. The host then opens the matching editor. */
  onPick: (type: QuestionType) => void;
}

export function QuestionTypePicker({ onClose, onPick }: QuestionTypePickerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="auth-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Pick question type"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="auth-modal auth-modal--sm">
        <header className="auth-modal-header">
          <h2 className="auth-modal-title">New question — pick a type</h2>
          <div className="auth-modal-header-actions">
            <button
              type="button"
              className="auth-modal-close"
              aria-label="Close"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </header>
        <div className="auth-modal-body">
          <p className="auth-hint">
            Choose the type of question you want to author. More types
            land slice-by-slice; disabled types are coming soon.
          </p>
          <ul className="auth-type-list">
            {QUESTION_TYPES.map((t) => {
              const enabled = ENABLED_TYPES.has(t.value);
              return (
                <li key={t.value}>
                  <button
                    type="button"
                    className={
                      enabled
                        ? 'auth-type-btn'
                        : 'auth-type-btn auth-type-btn--disabled'
                    }
                    onClick={() => enabled && onPick(t.value)}
                    disabled={!enabled}
                  >
                    <span className="auth-type-btn-code">{t.value}</span>
                    <span className="auth-type-btn-label">{t.label}</span>
                    {!enabled && (
                      <span className="auth-type-btn-tag">coming soon</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
