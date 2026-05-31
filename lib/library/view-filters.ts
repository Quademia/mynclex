// mynclex/lib/library/view-filters.ts
//
// Custom-view filter model (slice 11.16c). A "view" is a saved
// combination of filter chips over the tutor's own notes. v1 filters
// on three dimensions:
//   • status  — any / published / draft
//   • pillars — OR within (a note matches if it carries ANY selected
//               pillar)
//   • tags    — OR within (a note matches if it carries ANY selected
//               tag)
// AND across dimensions (status AND pillars AND tags must all pass).
//
// Folder + shelf as filter dimensions, and a saved free-text query,
// are deliberately out of v1 scope (folders/shelves are already
// one-click scopes; saved search needs the FTS round-trip). They can
// extend this shape later — the predicate + UI are written to grow.
//
// The whole model is pure functions over the already-fetched
// `LibraryNoteLensRow` set — every field it reads (is_published,
// pillars, tags) is on that projection, so filtering happens in
// memory with no extra round trip. c-2 persists a `LibraryViewFilters`
// as `filters_json` on `nclex_tutor_library_views`.

import type { LibraryNoteLensRow, NclexPillar } from './types';

export type LibraryViewStatus = 'any' | 'published' | 'draft';

export type LibraryViewFilters = {
  status: LibraryViewStatus;
  pillars: NclexPillar[];
  tags: string[];
};

/**
 * One saved custom view (slice 11.16c-2) — a named filter combo, one
 * row in `nclex_tutor_library_views`. `filters` is the normalised
 * `filters_json`. `position` drives sidebar order.
 */
export type LibrarySavedView = {
  view_id: string;
  name: string;
  filters: LibraryViewFilters;
  position: number;
};

/** A saved view plus the live count of notes its combo matches. */
export type LibrarySavedViewWithCount = LibrarySavedView & {
  count: number;
};

export const EMPTY_VIEW_FILTERS: LibraryViewFilters = {
  status: 'any',
  pillars: [],
  tags: [],
};

/**
 * True when no dimension is constrained — the builder treats this as
 * "nothing to save / showing everything". Drives the disabled state on
 * the Save button (c-2) and the "all notes" fallback copy.
 */
export function isEmptyFilters(f: LibraryViewFilters): boolean {
  return (
    f.status === 'any' && f.pillars.length === 0 && f.tags.length === 0
  );
}

/**
 * Does a note satisfy the filter combo? AND across the three
 * dimensions; OR within the multi-value pillar / tag dimensions.
 */
export function matchesViewFilters(
  row: LibraryNoteLensRow,
  f: LibraryViewFilters,
): boolean {
  if (f.status === 'published' && !row.is_published) return false;
  if (f.status === 'draft' && row.is_published) return false;

  if (f.pillars.length > 0) {
    const hit = f.pillars.some((p) => row.pillars.includes(p));
    if (!hit) return false;
  }

  if (f.tags.length > 0) {
    const hit = f.tags.some((t) => row.tags.includes(t));
    if (!hit) return false;
  }

  return true;
}

/**
 * Filter a row set by the combo. Preserves the incoming order (the
 * cached fetch is newest-edit-first).
 */
export function applyViewFilters(
  rows: LibraryNoteLensRow[],
  f: LibraryViewFilters,
): LibraryNoteLensRow[] {
  if (isEmptyFilters(f)) return rows;
  return rows.filter((r) => matchesViewFilters(r, f));
}

const STATUS_LABEL: Record<LibraryViewStatus, string> = {
  any: 'Any status',
  published: 'Published',
  draft: 'Drafts',
};

/**
 * Short human summary of the active combo — used in the saved-view
 * sub-line and (c-2) anywhere a view's definition needs spelling out.
 * Returns 'All notes' for the empty combo.
 */
export function describeFilters(f: LibraryViewFilters): string {
  if (isEmptyFilters(f)) return 'All notes';
  const parts: string[] = [];
  if (f.status !== 'any') parts.push(STATUS_LABEL[f.status]);
  if (f.pillars.length > 0) {
    parts.push(
      f.pillars.length === 1
        ? '1 pillar'
        : `${f.pillars.length} pillars`,
    );
  }
  if (f.tags.length > 0) {
    parts.push(f.tags.length === 1 ? '1 tag' : `${f.tags.length} tags`);
  }
  return parts.join(' · ');
}

/**
 * Coerce an unknown JSON value (from `filters_json`) into a valid
 * `LibraryViewFilters`, dropping anything malformed. Used by c-2's
 * read path so a hand-edited / future-shaped row can never crash the
 * builder — unknown keys are ignored, bad values fall back to empty.
 */
export function normalizeFilters(raw: unknown): LibraryViewFilters {
  if (raw == null || typeof raw !== 'object') return { ...EMPTY_VIEW_FILTERS };
  const o = raw as Record<string, unknown>;

  const status: LibraryViewStatus =
    o.status === 'published' || o.status === 'draft' ? o.status : 'any';

  const pillars = Array.isArray(o.pillars)
    ? (o.pillars.filter((p) => typeof p === 'string') as NclexPillar[])
    : [];

  const tags = Array.isArray(o.tags)
    ? (o.tags.filter((t) => typeof t === 'string') as string[])
    : [];

  return { status, pillars, tags };
}
