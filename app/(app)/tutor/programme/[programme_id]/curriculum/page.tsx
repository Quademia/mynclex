// mynclex/app/(app)/tutor/programme/[programme_id]/curriculum/page.tsx
//
// Curriculum index. The rail lives in the layout; this index just lands
// the tutor on a unit — it redirects to the first unit so the workspace
// always opens with something selected (2026-06 master-detail redesign;
// replaces the old Units-grid page). A programme's length is ≥1 so a
// unit almost always exists; the empty branch is defensive.

import { redirect } from 'next/navigation';
import { getUnitsForProgramme } from '@/lib/curriculum/queries';
import { CurIcon } from '@/lib/curriculum/cur-icon';

export const dynamic = 'force-dynamic';

export default async function CurriculumIndexPage({
  params,
}: {
  params: Promise<{ programme_id: string }>;
}) {
  const { programme_id } = await params;
  const units = await getUnitsForProgramme(programme_id);

  if (units.length > 0) {
    redirect(
      `/tutor/programme/${programme_id}/curriculum/unit/${units[0].unit_id}`
    );
  }

  return (
    <div className="cur-detail-blank">
      <div className="cur-empty">
        <div className="cur-empty-icon">
          <CurIcon name="layers" size={26} />
        </div>
        <h2 className="cur-empty-title">No units yet</h2>
        <p className="cur-empty-sub">
          Add a unit from the list on the left to start building.
        </p>
      </div>
    </div>
  );
}
