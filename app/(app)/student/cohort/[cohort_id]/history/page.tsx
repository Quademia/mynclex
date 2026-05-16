// mynclex/app/(app)/student/cohort/[cohort_id]/history/page.tsx
//
// Progress engine Slice 4 — programme attempt history page
// (tutor-led delivery mode entry point). Resolves the cohort's
// parent programme, then renders the same table as the
// /student/programme/[id]/history page. Attempts attach to the
// template programme via the activity, not to a cohort, so two
// cohort routes of the same programme see the same rows.

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCohortHistoryAttempts } from '@/lib/practice/history/programme-queries';
import { ProgrammeHistoryTable } from '@/lib/practice/history/programme-history-table';
import type { UnitLabel } from '@/lib/programmes/types';

export const dynamic = 'force-dynamic';

export default async function StudentCohortHistoryPage({
  params,
}: {
  params: Promise<{ cohort_id: string }>;
}) {
  const { cohort_id } = await params;
  const supabase = await createClient();

  // Resolve cohort -> parent programme for the header copy +
  // unit_label, in parallel with the attempts fetch.
  const [cohortRes, attempts] = await Promise.all([
    supabase
      .from('nclex_cohorts')
      .select(
        `cohort_id, name, programme_id,
         nclex_programmes!inner(title, unit_label)`
      )
      .eq('cohort_id', cohort_id)
      .maybeSingle(),
    getCohortHistoryAttempts(cohort_id),
  ]);

  if (cohortRes.error || !cohortRes.data || attempts === null) notFound();

  const cohort = cohortRes.data;
  const programmeRaw = (
    cohort as typeof cohort & {
      nclex_programmes:
        | { title: string; unit_label: UnitLabel }
        | Array<{ title: string; unit_label: UnitLabel }>
        | null;
    }
  ).nclex_programmes;
  const programme = Array.isArray(programmeRaw)
    ? programmeRaw[0]
    : programmeRaw;
  if (!programme) notFound();

  return (
    <>
      <header className="hist-head">
        <h1 className="hist-h1">Quiz History</h1>
        <p className="hist-sub">
          Your past attempts in {programme.title}
          {cohort.name ? ` — ${cohort.name}` : ''}.
        </p>
      </header>
      <ProgrammeHistoryTable
        attempts={attempts}
        unitLabelKind={programme.unit_label}
      />
    </>
  );
}
