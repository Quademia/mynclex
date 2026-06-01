// mynclex/app/(app)/student/programme/[programme_id]/library/page.tsx
//
// Slice 11.14a — the student library "front door" for SELF-PACED
// programmes. Read-only mirror of the tutor library home, scoped to the
// programme's tutor. Auth + enrolment are gated by the programme layout
// (StudentProgrammeShell → requireStudentProgrammeAccess); this page
// resolves the active lens scope from the URL and hands a snapshot to
// the shared client shell (the cohort route is the tutor-led sibling).
//
// Note rows link to the read view (slice 11.13) — not built yet, so a
// click 404s until then; this slice deliberately builds the front door
// first.

import { notFound } from 'next/navigation';
import { getStudentLibrarySnapshot } from '@/lib/library/student/queries';
import { StudentLibraryShell } from '@/lib/library/student/student-library-shell';
import { parseStudentLibraryScope } from '@/lib/library/student/scope';

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

export default async function StudentProgrammeLibraryPage({
  params,
  searchParams,
}: PageProps) {
  const { programme_id } = await params;
  const sp = await searchParams;

  const snapshot = await getStudentLibrarySnapshot(programme_id);
  if (!snapshot) notFound();

  return (
    <StudentLibraryShell
      snapshot={snapshot}
      basePath={`/student/programme/${programme_id}/library`}
      scope={parseStudentLibraryScope(sp)}
    />
  );
}
