// mynclex/lib/tutor-quiz/quiz-tag-input.tsx
//
// Chip row + free-text input for quiz tags, lifted to the quiz
// domain from the library's proven note-tag interaction (copy the
// pattern, don't couple to the library — the library component's copy
// is note-specific and its styling is library-flavoured). Styled to
// the .prog-* form-modal vocabulary the QuizFormModal already uses.
//
// Interaction model:
//   • Each tag renders as a chip with an × on the right.
//   • A trailing text input lets the tutor type a new tag.
//   • Enter / comma / Tab commits the draft as a new tag.
//   • Backspace on an empty input pops the trailing chip.
//   • Click × on a chip removes it.
//
// Validation mirrors the server's normalizeTags (actions.ts): tags
// are lowercased, unique, 1..40 chars, max 16 per quiz.

'use client';

import { useState, type KeyboardEvent } from 'react';

const TAG_MAX_LEN = 40;
const TAGS_MAX = 16;

interface QuizTagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export function QuizTagInput({ value, onChange, disabled }: QuizTagInputProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  function commit(rawTag: string) {
    const tag = rawTag.trim().toLowerCase();
    if (tag.length === 0) return;
    if (tag.length > TAG_MAX_LEN) {
      setError(`Tags must be ${TAG_MAX_LEN} characters or fewer.`);
      return;
    }
    if (value.includes(tag)) {
      setError(`This quiz already has the tag "${tag}".`);
      return;
    }
    if (value.length >= TAGS_MAX) {
      setError(`A quiz can have at most ${TAGS_MAX} tags.`);
      return;
    }
    setError(null);
    onChange([...value, tag]);
    setDraft('');
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (draft.trim().length > 0) {
        e.preventDefault();
        commit(draft);
      }
    } else if (
      e.key === 'Backspace' &&
      draft.length === 0 &&
      value.length > 0
    ) {
      e.preventDefault();
      // Pop the trailing chip so the tutor can re-type a typo.
      onChange(value.slice(0, -1));
    } else if (error) {
      // Any other keypress clears the inline error.
      setError(null);
    }
  }

  return (
    <div className="quiz-tags-input">
      <div className="quiz-tags-row">
        {value.map((tag) => (
          <span key={tag} className="quiz-tags-chip">
            <span>#{tag}</span>
            <button
              type="button"
              className="quiz-tags-chip-x"
              aria-label={`Remove tag ${tag}`}
              onClick={() => remove(tag)}
              disabled={disabled}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          className="quiz-tags-text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (draft.trim().length > 0) commit(draft);
          }}
          // Always show the affordance — even once tags exist — so the
          // "add another" field is never invisible.
          placeholder="+ Add tag"
          title="Type a tag and press Enter"
          aria-label="Add tag"
          maxLength={TAG_MAX_LEN + 10}
          disabled={disabled}
        />
      </div>
      {error && <span className="quiz-tags-error">{error}</span>}
    </div>
  );
}
