// mynclex/lib/library/tag-input.tsx
//
// Chip row + free-text input for note tags. Used only by the
// note editor's inline meta row (the new-note modal doesn't surface
// tags — they're a "live with the note" thing, set in the editor).
//
// Interaction model:
//   • Each existing tag renders as a chip with an × on the right.
//   • A trailing text input lets the tutor type a new tag.
//   • Enter / comma / Tab on the input pushes a new tag.
//   • Backspace on an empty input pops the trailing chip.
//   • Click × on a chip removes it.
//
// Validation (server-mirror): tags are unique within a note,
// 1..40 chars each, max 16 per note.

'use client';

import { useState, type KeyboardEvent } from 'react';

const TAG_MAX_LEN = 40;
const TAGS_MAX = 16;

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
}

export function TagInput({ value, onChange }: TagInputProps) {
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
      setError(`Tag #${tag} is already on this note.`);
      return;
    }
    if (value.length >= TAGS_MAX) {
      setError(`A note can have at most ${TAGS_MAX} tags.`);
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
    } else if (e.key === 'Backspace' && draft.length === 0 && value.length > 0) {
      e.preventDefault();
      // Pop the trailing chip so the tutor can re-type a typo.
      onChange(value.slice(0, -1));
    } else if (error) {
      // Any other keypress clears the inline error.
      setError(null);
    }
  }

  return (
    <div className="lib-tag-input">
      <div className="lib-tag-input-row">
        {value.map((tag) => (
          <span key={tag} className="lib-tag-chip">
            <span>#{tag}</span>
            <button
              type="button"
              className="lib-tag-chip-x"
              aria-label={`Remove tag ${tag}`}
              onClick={() => remove(tag)}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          className="lib-tag-text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (draft.trim().length > 0) commit(draft);
          }}
          placeholder={value.length === 0 ? '+ tag' : ''}
          aria-label="Add tag"
          maxLength={TAG_MAX_LEN + 10}
        />
      </div>
      {error && <span className="lib-field-error">{error}</span>}
    </div>
  );
}
