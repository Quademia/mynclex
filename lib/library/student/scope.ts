// mynclex/lib/library/student/scope.ts
//
// The student library lens scope + its URL parser. Server-safe (no
// 'use client'), so both route pages (programme + cohort) and the
// client shell share one definition.
//
// Scope precedence (mirrors the tutor route): shelf > view > pillar >
// tag > folder > all-notes (default). Only the All-notes view is wired;
// Recent / By unit / Bookmarked are disabled placeholders, so any other
// `?view=` value falls through to All notes.

import { NCLEX_PILLARS, type NclexPillar } from '../types';

export type StudentLibraryScope =
  | { kind: 'all-notes' }
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
    // Only 'all-notes' is wired; everything else (Recent / By unit /
    // Bookmarked) falls through to the All notes list.
    return { kind: 'all-notes' };
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
  return { kind: 'all-notes' };
}
