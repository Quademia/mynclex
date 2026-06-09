// mynclex/app/(app)/tutor/programme/[programme_id]/library/page.tsx
//
// Programme Library tab (tutor) — a read-only "student preview" of the
// notes students enrolled in THIS programme can see. The tutor-side
// mirror of /student/programme/[id]/library, fed a tutor-computed
// entitlement set (TUTOR_WIDE ∪ PROGRAMME_SCOPED-to-this-programme,
// published only) rather than RLS-filtered student rows.
//
// Programme ownership is gated by getProgrammeForShell (RLS-scoped to
// the tutor; null → 404) — same pattern as the sibling Quizzes tab.
//
// Note rows link to the in-place read view (slice 2).

import { notFound } from 'next/navigation';
import { getProgrammeForShell } from '@/lib/programmes/queries';
import {
  getProgrammeLibrarySnapshot,
  getProgrammeStudentCount,
} from '@/lib/library/programme/queries';
import { ProgrammeLibraryShell } from '@/lib/library/programme/programme-library-shell';
import { parseProgrammeLibraryScope } from '@/lib/library/programme/scope';

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

export default async function TutorProgrammeLibraryPage({
  params,
  searchParams,
}: PageProps) {
  const { programme_id } = await params;
  const sp = await searchParams;

  // Ownership gate (RLS) — null means doesn't exist OR not yours.
  const programme = await getProgrammeForShell(programme_id);
  if (!programme) notFound();

  const [snapshot, studentCount] = await Promise.all([
    getProgrammeLibrarySnapshot(programme_id),
    getProgrammeStudentCount(programme_id),
  ]);
  if (!snapshot) notFound();

  const scope = parseProgrammeLibraryScope(sp);

  return (
    <ProgrammeLibraryShell
      snapshot={snapshot}
      basePath={`/tutor/programme/${programme_id}/library`}
      programmeTitle={programme.title}
      studentCount={studentCount}
      scope={scope}
    />
  );
}
