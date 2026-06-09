// mynclex/app/(app)/tutor/programme/[programme_id]/curriculum/layout.tsx
//
// Curriculum workspace shell (2026-06 master-detail redesign). Wraps
// BOTH the index (/curriculum) and the unit detail
// (/curriculum/unit/[unit_id]) so the unit RAIL persists while only the
// detail pane ({children}) swaps when you click between units. Fetches
// the unit list (rail) + the parent programme (label + length cap) once
// here; the detail child fetches its own unit.

import { notFound } from 'next/navigation';
import {
  getProgrammeForShell,
  getProgrammeStatus,
} from '@/lib/programmes/queries';
import { getUnitsForProgramme } from '@/lib/curriculum/queries';
import { CurriculumWorkspace } from '@/lib/curriculum/curriculum-workspace';

export const dynamic = 'force-dynamic';

export default async function CurriculumLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;

  const [programme, statusCtx, units] = await Promise.all([
    getProgrammeForShell(programme_id),
    getProgrammeStatus(programme_id),
    getUnitsForProgramme(programme_id),
  ]);
  if (!programme) notFound();

  // Live programme → guard a silent unit unpublish on the rail.
  const programmePublished = statusCtx?.status === 'PUBLISHED';

  return (
    <CurriculumWorkspace
      programmeId={programme.programme_id}
      unitLabel={programme.unit_label}
      lengthUnits={programme.length_units}
      programmePublished={programmePublished}
      units={units}
    >
      {children}
    </CurriculumWorkspace>
  );
}
