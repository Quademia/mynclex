// mynclex/app/(app)/student/programme/[programme_id]/library/page.tsx
//
// Slice 11.14 — the student library "front door". Read-only mirror of
// the tutor library home (/tutor/library), scoped to the programme's
// tutor. Auth + enrolment are gated by the programme layout
// (StudentProgrammeShell → requireStudentProgrammeAccess); this page
// resolves the active lens scope from the URL and hands a snapshot to
// the client shell, which derives counts + filters client-side.
//
// Scope precedence (mirrors the tutor route): shelf > view > pillar >
// tag > folder > all-notes (default). The note rows link to the read
// view (slice 11.13) — not built yet, so a click 404s until then; this
// slice deliberately builds the destination's front door first.

import { notFound } from 'next/navigation';
import { getStudentLibrarySnapshot } from '@/lib/library/student/queries';
import {
  StudentLibraryShell,
  type StudentLibraryScope,
} from '@/lib/library/student/student-library-shell';
import { NCLEX_PILLARS, type NclexPillar } from '@/lib/library/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ programme_id: string }>;
  searchParams: Promise<{
    folder?: string | string[];
    shelf?: string | string[];
    view?: string | string[];
    pillar?: string | string[];
    tag?: string | string[];
  }>;
}

function firstOrNull(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

function resolveScope(params: {
  folder: string | null;
  shelf: string | null;
  view: string | null;
  pillar: string | null;
  tag: string | null;
}): StudentLibraryScope {
  // shelf > view > pillar > tag > folder > all-notes
  if (params.shelf != null) {
    return params.shelf === 'all'
      ? { kind: 'all-shelves' }
      : { kind: 'shelf', id: params.shelf };
  }
  // Only 'all-notes' is wired; Recent / By unit / Bookmarked are
  // disabled placeholders, so any other view value falls through to
  // the All notes list.
  if (params.view != null && params.view !== 'all-notes') {
    return { kind: 'all-notes' };
  }
  if (params.view === 'all-notes') return { kind: 'all-notes' };
  if (params.pillar != null) {
    const decoded = decodeURIComponent(params.pillar);
    if ((NCLEX_PILLARS as readonly string[]).includes(decoded)) {
      return { kind: 'pillar', id: decoded as NclexPillar };
    }
    return { kind: 'all-notes' };
  }
  if (params.tag != null) {
    return { kind: 'tag', id: decodeURIComponent(params.tag) };
  }
  if (params.folder != null) {
    return params.folder === 'all'
      ? { kind: 'all-folders' }
      : { kind: 'folder', id: params.folder };
  }
  return { kind: 'all-notes' };
}

export default async function StudentProgrammeLibraryPage({
  params,
  searchParams,
}: PageProps) {
  const { programme_id } = await params;
  const sp = await searchParams;

  const snapshot = await getStudentLibrarySnapshot(programme_id);
  if (!snapshot) notFound();

  const scope = resolveScope({
    folder: firstOrNull(sp.folder),
    shelf: firstOrNull(sp.shelf),
    view: firstOrNull(sp.view),
    pillar: firstOrNull(sp.pillar),
    tag: firstOrNull(sp.tag),
  });

  return (
    <StudentLibraryShell
      snapshot={snapshot}
      programmeId={programme_id}
      scope={scope}
    />
  );
}
