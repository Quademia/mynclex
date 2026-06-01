// mynclex/lib/library/tag-multi-picker.tsx
//
// Multi-select popover over the tutor's existing tag vocabulary, used
// by the custom-view filter bar (slice 11.16c). Mirrors the
// PillarPicker contract: the caller owns the trigger + anchor; this
// renders the open popover only. Click-outside and ESC close.
//
// Selection is controlled — caller passes `value` (selected tags) and
// `onChange` receiving the next array on every toggle. Tags are shown
// with their usage counts (the LibraryTagCount shape the sidebar lens
// already computes), most-used first.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryTagCount } from './types';

interface TagMultiPickerProps {
  tags: LibraryTagCount[];
  value: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
  className?: string;
}

export function TagMultiPicker({
  tags,
  value,
  onChange,
  onClose,
  className,
}: TagMultiPickerProps) {
  const popRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    function onPointer(e: PointerEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return tags;
    return tags.filter((t) => t.tag.toLowerCase().includes(q));
  }, [tags, query]);

  function toggle(tag: string) {
    if (value.includes(tag)) onChange(value.filter((t) => t !== tag));
    else onChange([...value, tag]);
  }

  return (
    <div
      ref={popRef}
      className={`lib-popover lib-tag-multi-picker${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-label="Pick tags"
    >
      <div className="lib-popover-head">Filter by tags</div>
      {tags.length > 8 && (
        <div className="lib-tmp-search">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a tag…"
            aria-label="Find a tag"
            autoFocus
          />
        </div>
      )}
      <div className="lib-popover-body">
        {tags.length === 0 ? (
          <div className="lib-fp-empty">
            No tags yet — add tags from a note&apos;s editor.
          </div>
        ) : filtered.length === 0 ? (
          <div className="lib-fp-empty">No tags match “{query}”.</div>
        ) : (
          filtered.map(({ tag, count }) => {
            const on = value.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                className={`lib-pp-row${on ? ' is-on' : ''}`}
                onClick={() => toggle(tag)}
                role="checkbox"
                aria-checked={on}
              >
                <span className="lib-pp-check" aria-hidden="true">
                  {on ? '✓' : ''}
                </span>
                <span className="lib-pp-name">
                  <span className="lens-tag-hash" aria-hidden="true">
                    #
                  </span>
                  {tag}
                </span>
                <span className="lib-tmp-count">{count}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
