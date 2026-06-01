// mynclex/lib/library/search-fields.ts
//
// Shared encode/decode for the library search field-scope (`?qf=`)
// URL param (slice 11.16a). Keeping the contract in one module means
// the page (decode) and the search box (encode) can never drift.
//
// Convention: all-fields-on is the DEFAULT, so it encodes to null —
// a bare `?q=furosemide` means "search every field". Any narrower
// scope encodes as a comma-list of the ON fields (`?qf=title,body`).

import {
  ALL_SEARCH_FIELDS_ON,
  LIBRARY_SEARCH_FIELDS,
  type LibrarySearchFieldFlags,
} from './types';

/** Field flags → `?qf=` value. Returns null when all fields are on. */
export function encodeSearchFields(
  fields: LibrarySearchFieldFlags,
): string | null {
  const on = LIBRARY_SEARCH_FIELDS.filter((f) => fields[f]);
  if (on.length === LIBRARY_SEARCH_FIELDS.length) return null;
  return on.join(',');
}

/**
 * `?qf=` value → field flags. Missing / empty → all on. Unknown
 * tokens are ignored. A param that resolves to zero valid fields
 * falls back to all-on — a search with no fields returns nothing, so
 * a malformed param should mean "search everything", not a dead end.
 */
export function decodeSearchFields(
  raw: string | null,
): LibrarySearchFieldFlags {
  if (raw == null || raw.trim() === '') return { ...ALL_SEARCH_FIELDS_ON };

  const tokens = new Set(
    raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  );
  const flags: LibrarySearchFieldFlags = {
    title: tokens.has('title'),
    subtitle: tokens.has('subtitle'),
    description: tokens.has('description'),
    body: tokens.has('body'),
  };
  const anyOn = LIBRARY_SEARCH_FIELDS.some((f) => flags[f]);
  return anyOn ? flags : { ...ALL_SEARCH_FIELDS_ON };
}
