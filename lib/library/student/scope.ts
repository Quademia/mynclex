// mynclex/lib/library/student/scope.ts
//
// The student library lens scope + its URL parser. Server-safe (no
// 'use client'), so both route pages (programme + cohort) and the
// client shell share one definition.
//
// Scope precedence (mirrors the tutor route): shelf > view > pillar >
// tag > folder > home (default). Wired views: home / all-notes / recent /
// bookmarked. "By unit" stays a disabled placeholder (needs slice 11.11),
// so `?view=by-unit` (or any unknown view) falls through to the Study Home.

import { NCLEX_PILLARS, type NclexPillar } from '../types';

export type StudentLibraryScope =
  // The Study Home (slice 11.14c) — the default landing.
  | { kind: 'home' }
  | { kind: 'all-notes' }
  | { kind: 'recent' }
  | { kind: 'bookmarked' }
  | { kind: 'folder'; id: string }
  | { kind: 'all-folders' }
  | { kind: 'shelf'; id: string }
  | { kind: 'all-shelves' }
  | { kind: 'pillar'; id: NclexPillar }
  | { kind: 'tag'; id: string };

export function firstOrNull(
  raw: string | string[] | undefined,
): string | null {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

export function parseStudentLibraryScope(params: {
  folder?: string | string[];
  shelf?: string | string[];
  view?: string | string[];
  pillar?: string | string[];
  tag?: string | string[];
}): StudentLibraryScope {
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
    // Wired views: all-notes / recent / bookmarked. "by-unit" (and any
    // unknown value) falls through to the Study Home.
    if (view === 'all-notes') return { kind: 'all-notes' };
    if (view === 'recent') return { kind: 'recent' };
    if (view === 'bookmarked') return { kind: 'bookmarked' };
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
