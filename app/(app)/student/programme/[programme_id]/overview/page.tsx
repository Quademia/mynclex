// mynclex/app/(app)/student/programme/[programme_id]/overview/page.tsx
//
// Student Overview — self-paced programme home (2026-06). The landing
// surface (the programme index redirects here). STUDENT role + programme
// RLS-readability are gated by the programme layout (StudentProgrammeShell
// → requireStudentProgrammeAccess) before this runs.

import { notFound } from 'next/navigation';
import { getStudentProgrammeOverview } from '@/lib/home/student/overview-queries';
import { StudentOverview } from '@/lib/home/student/student-overview';

export const dynamic = 'force-dynamic';

export default async function StudentProgrammeOverviewPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;
  const data = await getStudentProgrammeOverview(programme_id);
  if (!data) notFound();

  return <StudentOverview data={data} />;
}
