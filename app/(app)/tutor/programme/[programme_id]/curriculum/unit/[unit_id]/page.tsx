// mynclex/app/(app)/tutor/programme/[programme_id]/curriculum/unit/[unit_id]/page.tsx
//
// Unit detail — the right-hand DETAIL PANE of the curriculum workspace
// (2026-06 master-detail redesign). The unit RAIL + back navigation now
// live in the curriculum layout, so this page is just the selected
// unit's builder. 404s when the unit doesn't exist or belongs to a
// programme the tutor doesn't own.

import { notFound } from 'next/navigation';
import { getUnitDetail } from '@/lib/curriculum/queries';
import { UnitBuilder } from '@/lib/curriculum/unit-builder';

export const dynamic = 'force-dynamic';

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ programme_id: string; unit_id: string }>;
}) {
  const { programme_id, unit_id } = await params;

  const detail = await getUnitDetail(unit_id);
  if (!detail) notFound();

  // Defensive: the route's programme_id should match the unit's parent.
  if (detail.programme.programme_id !== programme_id) notFound();

  return (
    <div className="cur-detail">
      <UnitBuilder
        unit={detail.unit}
        blocks={detail.blocks}
        activities={detail.activities}
        programmeUnitLabel={detail.programme.unit_label}
        programmePublished={detail.programme.status === 'PUBLISHED'}
      />
    </div>
  );
}
