// mynclex/app/(app)/tutor/page.tsx
//
// Tutor Home — the cross-programme triage dashboard a tutor lands on
// after login (/router → /tutor). Renders its own global chrome via
// <TutorGlobalShell> because the parent (app)/tutor/layout.tsx is a
// slim role-gate that intentionally renders no chrome (so programme-
// detail can swap in a different sidebar). The "Home" sidebar entry
// (lib/nav/tutor.ts) is `exact`, active only on this exact path.
//
// Data: lib/home/tutor/home-queries → getTutorHomeData(), assembled
// from existing surfaces (programmes, cohorts, enrolments, enquiries,
// completion analytics, live sessions, workspace). See
// docs/product-plan/tutor-home.md.

import { TutorGlobalShell } from '@/components/nav/tutor/global-shell';
import { getTutorHomeData } from '@/lib/home/tutor/home-queries';
import { TutorHome } from '@/lib/home/tutor/tutor-home';

export const dynamic = 'force-dynamic';

export default async function TutorHomePage() {
  const data = await getTutorHomeData();
  return (
    <TutorGlobalShell>
      <TutorHome data={data} />
    </TutorGlobalShell>
  );
}
