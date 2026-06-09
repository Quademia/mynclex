// mynclex/lib/library/programme/scope.ts
//
// The tutor programme-library preview lens scope + its URL parser.
// Server-safe (no 'use client'), so the route page and the client shell
// share one definition. Mirrors lib/library/student/scope.ts, minus the
// per-student Recent / Bookmarked views (meaningless in a tutor preview).
//
// Scope precedence: shelf > view > pillar > tag > folder > home
// (default). Wired views: home / all-notes. "By unit" stays a disabled
// placeholder (needs slice 11.11), so `?view=by-unit` — or any unknown
// view — falls through to the Preview Home.

import { NCLEX_PILLARS, type NclexPillar } from '../types';
import { firstOrNull } from '../student/scope';

export type ProgrammeLibraryScope =
  | { kind: 'home' }
  | { kind: 'all-notes' }
  | { kind: 'folder'; id: string }
  | { kind: 'all-folders' }
  | { kind: 'shelf'; id: string }
  | { kind: 'all-shelves' }
  | { kind: 'pillar'; id: NclexPillar }
  | { kind: 'tag'; id: string };

export function parseProgrammeLibraryScope(params: {
  folder?: string | string[];
  shelf?: string | string[];
  view?: string | string[];
  pillar?: string | string[];
  tag?: string | string[];
}): ProgrammeLibraryScope {
  const folder = firstOrNull(params.folder);
  const shelf = firstOrNull(params.shelf);
  const view = firstOrNull(params.view);
  const pillar = firstOrNull(params.pillar);
  const tag = firstOrNull(params.tag);

  if (shelf != null) {
    return shelf === 'all'
      ? { kind: 'all-shelves' }
      : { kind: 'shelf', id: shelf };
  }
  if (view != null) {
    // Wired views: all-notes. "by-unit" (and any unknown value) falls
    // through to the Preview Home.
    if (view === 'all-notes') return { kind: 'all-notes' };
    return { kind: 'home' };
  }
  if (pillar != null) {
    const decoded = decodeURIComponent(pillar);
    if ((NCLEX_PILLARS as readonly string[]).includes(decoded)) {
      return { kind: 'pillar', id: decoded as NclexPillar };
    }
    return { kind: 'all-notes' };
  }
  if (tag != null) {
    return { kind: 'tag', id: decodeURIComponent(tag) };
  }
  if (folder != null) {
    return folder === 'all'
      ? { kind: 'all-folders' }
      : { kind: 'folder', id: folder };
  }
  return { kind: 'home' };
}
