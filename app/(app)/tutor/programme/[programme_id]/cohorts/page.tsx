// mynclex/app/(app)/tutor/programme/[programme_id]/cohorts/page.tsx
//
// Cohorts tab — list of runs AND the per-run detail, composed onto a
// single route (the cohort-workspace fold, 2026-06-12 — the library
// pattern). URL params drive what renders:
//   • no `?cohort=`        → the runs list (header + cards + New).
//   • `?cohort=<uuid>`     → that run's in-page detail (header + tabs).
//   • `&tab=`              → overview (default) / curriculum /
//                            analytics / sessions / settings.
// The programme sidebar stays put throughout — entering a run no
// longer swaps the chrome.
//
// SELF_PACED programmes have no cohort layer, so direct nav to the
// URL 404s; the sidebar entry hides for them too (see
// components/nav/tutor/programme-shell.tsx).
//
// The +New cohort button lives in the header; an empty-state CTA
// covers the "no cohorts yet" path.

import { notFound } from 'next/navigation';
import { getOwnedProgrammeForShell } from '@/lib/programmes/queries';
import { getCohortsForProgramme } from '@/lib/cohorts/queries';
import { CohortList } from '@/lib/cohorts/cohort-list';
import {
  CohortDetail,
  parseCohortDetailTab,
  parseSessionsSubTab,
} from '@/lib/cohorts/cohort-detail';
import { NewCohortTrigger } from '@/lib/cohorts/new-cohort-trigger';

export const dynamic = 'force-dynamic';

function firstOrNull(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return null;
}

export default async function ProgrammeCohortsPage({
  params,
  searchParams,
}: {
  params: Promise<{ programme_id: string }>;
  searchParams: Promise<{
    cohort?: string | string[];
    tab?: string | string[];
    stab?: string | string[];
  }>;
}) {
  const { programme_id } = await params;
  const sp = await searchParams;

  const programme = await getOwnedProgrammeForShell(programme_id);
  if (!programme) notFound();
  if (programme.delivery_mode === 'SELF_PACED') notFound();

  // A run is selected → its detail renders in place of the list. The
  // whole detail uses a wider container than the 880px list: the
  // Curriculum tab is a two-pane and Analytics/Sessions are
  // dashboard/table surfaces that benefit from the room — and one
  // width keeps the frame steady when switching tabs.
  const cohortSelected = firstOrNull(sp.cohort);
  if (cohortSelected) {
    return (
      <div className="cohorts-page is-wide">
        <CohortDetail
          programmeId={programme_id}
          cohortId={cohortSelected}
          tab={parseCohortDetailTab(firstOrNull(sp.tab))}
          sessionsSubTab={parseSessionsSubTab(firstOrNull(sp.stab))}
        />
      </div>
    );
  }

  const cohorts = await getCohortsForProgramme(programme_id);

  return (
    <div className="cohorts-page">
      <header className="cohorts-head">
        <div>
          <h1 className="cohorts-title">Cohorts</h1>
          <p className="cohorts-sub">
            Each cohort is one run of this programme — its own dates,
            seats, and enrolled students.
          </p>
        </div>
        {cohorts.length > 0 && (
          <NewCohortTrigger
            programmeId={programme_id}
            programmeLengthUnits={programme.length_units}
            variant="header"
          />
        )}
      </header>

      {cohorts.length === 0 ? (
        <div className="cohorts-empty">
          <h2 className="cohorts-empty-title">
            No cohorts yet.
          </h2>
          <p className="cohorts-empty-sub">
            You can&apos;t enrol students until at least one cohort
            exists. Pick a start date, an end date, and (optionally) a
            seat cap.
          </p>
          <NewCohortTrigger
            programmeId={programme_id}
            programmeLengthUnits={programme.length_units}
            variant="empty"
          />
        </div>
      ) : (
        <CohortList programmeId={programme_id} cohorts={cohorts} />
      )}
    </div>
  );
}
