// mynclex/app/(app)/tutor/programme/[programme_id]/curriculum/page.tsx
//
// Programme curriculum tab — Units Overview grid (slice 9.3a,
// mockup screen 3). Read-only in this slice. Click-into-unit-
// detail lands in 9.3b.
//
// The route URL segment is `curriculum` regardless of the
// programme's unit_label (Week / Module). The unit-label
// distinction shows on each unit card via unitLabel().

import { notFound } from 'next/navigation';
import { getProgrammeForShell } from '@/lib/programmes/queries';
import { getUnitsForProgramme } from '@/lib/curriculum/queries';
import { UnitsGrid } from '@/lib/curriculum/units-grid';

export const dynamic = 'force-dynamic';

export default async function ProgrammeCurriculumPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;

  const programme = await getProgrammeForShell(programme_id);
  if (!programme) notFound();

  const units = await getUnitsForProgramme(programme_id);

  const labelNoun =
    programme.unit_label === 'WEEK' ? 'Weeks' : 'Modules';

  return (
    <div className="curriculum-page">
      <header className="curriculum-head">
        <div>
          <h1 className="curriculum-title">Curriculum</h1>
          <p className="curriculum-sub">
            {labelNoun} for this programme. Tap a unit to build out
            its blocks and activities.
          </p>
        </div>
      </header>

      <UnitsGrid
        units={units}
        programmeUnitLabel={programme.unit_label}
      />
    </div>
  );
}
