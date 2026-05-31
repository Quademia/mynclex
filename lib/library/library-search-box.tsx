'use client';

// mynclex/lib/library/library-search-box.tsx
//
// Toolbar search control (slice 11.16a). A controlled text input plus
// four per-field scope chips (Title / Subtitle / Description / Body).
//
// Behaviour:
//   • Submit (Enter or the search button) navigates to
//     `/tutor/library?q=<term>` (+ `&qf=` when the field scope is
//     narrowed). An empty submit returns to the bare library home.
//   • Toggling a field chip re-runs the search immediately when a
//     query is already committed; otherwise it just seeds the next
//     search. At least one field stays on — the toggle that would
//     clear the last field is ignored.
//
// Search results, ranking, and the actual matching all live
// server-side (the `nclex_search_library_notes` RPC); this component
// only drives the URL.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { encodeSearchFields } from './search-fields';
import {
  LIBRARY_SEARCH_FIELDS,
  type LibrarySearchField,
  type LibrarySearchFieldFlags,
} from './types';

const FIELD_LABEL: Record<LibrarySearchField, string> = {
  title: 'Title',
  subtitle: 'Subtitle',
  description: 'Description',
  body: 'Body',
};

export function LibrarySearchBox({
  initialQuery,
  initialFields,
}: {
  initialQuery: string;
  initialFields: LibrarySearchFieldFlags;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const [fields, setFields] = useState<LibrarySearchFieldFlags>(initialFields);

  function navigate(q: string, f: LibrarySearchFieldFlags) {
    const trimmed = q.trim();
    if (trimmed.length === 0) {
      router.push('/tutor/library');
      return;
    }
    const params = new URLSearchParams();
    params.set('q', trimmed);
    const qf = encodeSearchFields(f);
    if (qf) params.set('qf', qf);
    router.push(`/tutor/library?${params.toString()}`);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate(value, fields);
  }

  function toggleField(f: LibrarySearchField) {
    const next = { ...fields, [f]: !fields[f] };
    // Keep at least one field selected — a zero-field search matches
    // nothing, so ignore the toggle that would empty the set.
    if (!LIBRARY_SEARCH_FIELDS.some((k) => next[k])) return;
    setFields(next);
    if (value.trim().length > 0) navigate(value, next);
  }

  function clear() {
    setValue('');
    navigate('', fields);
  }

  return (
    <form className="lib-search-form" onSubmit={onSubmit} role="search">
      <div className="lib-search">
        <svg
          className="lib-search-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search notes…"
          aria-label="Search notes"
        />
        {value.length > 0 && (
          <button
            type="button"
            className="lib-search-clear"
            onClick={clear}
            aria-label="Clear search"
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <div
        className="lib-search-fields"
        role="group"
        aria-label="Search in fields"
      >
        <span className="lib-search-fields-label" aria-hidden="true">
          in
        </span>
        {LIBRARY_SEARCH_FIELDS.map((f) => (
          <button
            key={f}
            type="button"
            className={`lib-field-chip${fields[f] ? ' is-on' : ''}`}
            aria-pressed={fields[f]}
            onClick={() => toggleField(f)}
            title={`${fields[f] ? 'Searching' : 'Not searching'} ${
              FIELD_LABEL[f]
            }`}
          >
            {FIELD_LABEL[f]}
          </button>
        ))}
      </div>
    </form>
  );
}
