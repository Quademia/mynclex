// mynclex/app/(app)/tutor/programme/[programme_id]/enrolments/page.tsx
//
// Programme Enrolments tab — SELF_PACED programmes only. The programme
// is the enrolment container when there's no cohort layer, so this is
// the programme-level twin of the cohort Enrolments tab: same roster
// table, same lifecycle/payment actions, same Add student (creating
// cohort_id = NULL rows). Tutor-led programmes 404 here (their
// enrolments are managed per cohort; the sidebar hides this entry for
// them — the 404 is the belt-and-braces).

import { notFound } from 'next/navigation';
import { getProgrammeForShell } from '@/lib/programmes/queries';
import { getProgrammeRoster, getRosterPlanContext } from '@/lib/enrolments/queries';
import { EnrolmentRosterView } from '@/lib/enrolments/enrolment-roster-view';

export const dynamic = 'force-dynamic';

export default async function ProgrammeEnrolmentsPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;

  // Ownership gate (RLS-scoped, null → 404) + delivery-mode check.
  const programme = await getProgrammeForShell(programme_id);
  if (!programme || programme.delivery_mode !== 'SELF_PACED') notFound();

  const roster = await getProgrammeRoster(programme_id);
  if (roster === null) notFound();

  const planCtx = await getRosterPlanContext(programme_id);

  return (
    <EnrolmentRosterView
      scope={{ kind: 'PROGRAMME', programmeId: programme_id }}
      contextName={programme.title}
      roster={roster}
      plans={planCtx.plans}
      currency={planCtx.currency}
    />
  );
}
