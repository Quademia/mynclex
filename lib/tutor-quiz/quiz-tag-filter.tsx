// mynclex/lib/tutor-quiz/quiz-tag-filter.tsx
//
// Multi-select Tags facet for the /tutor/quizzes toolbar. A trigger
// styled like the toolbar's other selects (Kind / Sort) that opens a
// checklist popover of the tutor's quiz tags. OR semantics (a quiz
// matches if it carries ANY selected tag) — applied by the parent
// QuizList. Options + filtering are all client-side over the already-
// loaded list, so there's no query here.

'use client';

import { useEffect, useRef, useState } from 'react';
import { QuizIcon } from './quiz-icons';

export function QuizTagFilter({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(tag: string) {
    onChange(
      selected.includes(tag)
        ? selected.filter((t) => t !== tag)
        : [...selected, tag],
    );
  }

  const summary =
    selected.length === 0
      ? 'All'
      : selected.length === 1
        ? `#${selected[0]}`
        : `${selected.length} selected`;

  return (
    <div
      className={`quizzes-tagfilter ${selected.length ? 'is-set' : ''}`}
      ref={ref}
    >
      <button
        type="button"
        className="quizzes-select quizzes-tagfilter-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Filter by tag"
      >
        <QuizIcon name="hash" />
        <span className="lbl">Tags:</span>
        <span className="quizzes-tagfilter-summary">{summary}</span>
        <span className="quizzes-tagfilter-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          className="quizzes-tagfilter-pop"
          role="listbox"
          aria-label="Filter by tag"
        >
          {options.map((tag) => (
            <label key={tag} className="quizzes-tagfilter-option">
              <input
                type="checkbox"
                checked={selected.includes(tag)}
                onChange={() => toggle(tag)}
              />
              <span>#{tag}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <button
              type="button"
              className="quizzes-tagfilter-clear"
              onClick={() => onChange([])}
            >
              Clear tags
            </button>
          )}
        </div>
      )}
    </div>
  );
}
