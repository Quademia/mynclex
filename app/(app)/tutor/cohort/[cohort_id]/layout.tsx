// mynclex/app/(app)/tutor/cohort/[cohort_id]/layout.tsx
//
// Cohort-scoped chrome. Sibling subtree to /tutor/programme/
// [programme_id]/ — singular vs plural keeps them as separate
// worlds rather than parent-and-child. Renders its own AppShell
// (via <TutorCohortShell>) so the global tutor topbar/footer don't
// double-render on cohort pages.

import { TutorCohortShell } from '@/components/nav/tutor/cohort-shell';

export const dynamic = 'force-dynamic';

export default async function TutorCohortLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ cohort_id: string }>;
}) {
  const { cohort_id } = await params;
  return (
    <TutorCohortShell cohortId={cohort_id}>
      {children}
    </TutorCohortShell>
  );
}
