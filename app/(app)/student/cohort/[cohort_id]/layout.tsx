// mynclex/app/(app)/student/cohort/[cohort_id]/layout.tsx
//
// Slice 10.1 — student cohort-detail layout. Sibling to
// /student/programme/[programme_id]/* (each delivery mode has its
// own detail subtree). STUDENT gate, cohort RLS-readability, and
// sidebar :cohortId substitution happen inside
// <StudentCohortShell>.

import { StudentCohortShell } from '@/components/nav/student/cohort-shell';

export const dynamic = 'force-dynamic';

export default async function StudentCohortLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ cohort_id: string }>;
}) {
  const { cohort_id } = await params;
  return (
    <StudentCohortShell cohortId={cohort_id}>{children}</StudentCohortShell>
  );
}
