// mynclex/app/(app)/student/cohort/[cohort_id]/library/page.tsx
//
// Slice 11.14b — the student library "front door" for TUTOR-LED
// cohorts. The exact same surface as the self-paced programme route
// (same shell, same lenses, same read-only adaptations); only the entry
// point differs. A cohort belongs to a programme, which names the tutor
// — getStudentLibrarySnapshotForCohort resolves cohort → programme →
// tutor and builds the identical snapshot.
//
// Auth + enrolment are gated by the cohort layout (StudentCohortShell →
// requireStudentCohortAccess). Note rows link to the cohort read view
// (slice 11.13) — not built yet, so a click 404s until then.

import { notFound } from 'next/navigation';
import { getStudentLibrarySnapshotForCohort } from '@/lib/library/student/queries';
import { getStudentLibraryHomeData } from '@/lib/library/student/home-queries';
import { StudentLibraryShell } from '@/lib/library/student/student-library-shell';
import { parseStudentLibraryScope } from '@/lib/library/student/scope';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ cohort_id: string }>;
  searchParams: Promise<{
    folder?: string | string[];
    shelf?: string | string[];
    view?: string | string[];
    pillar?: string | string[];
    tag?: string | string[];
  }>;
}

export default async function StudentCohortLibraryPage({
  params,
  searchParams,
}: PageProps) {
  const { cohort_id } = await params;
  const sp = await searchParams;

  const snapshot = await getStudentLibrarySnapshotForCohort(cohort_id);
  if (!snapshot) notFound();

  const scope = parseStudentLibraryScope(sp);
  const needsHome =
    scope.kind === 'home' ||
    scope.kind === 'recent' ||
    scope.kind === 'bookmarked';
  const home = needsHome ? await getStudentLibraryHomeData(snapshot) : null;

  return (
    <StudentLibraryShell
      snapshot={snapshot}
      basePath={`/student/cohort/${cohort_id}/library`}
      scope={scope}
      home={home}
    />
  );
}
