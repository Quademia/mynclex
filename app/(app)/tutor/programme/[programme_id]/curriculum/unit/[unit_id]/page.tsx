// mynclex/app/(app)/tutor/programme/[programme_id]/curriculum/unit/[unit_id]/page.tsx
//
// Unit Builder URL handler (slice 9.3b, mockup screen 4). Fetches
// the unit + its loose activities + parent programme in one trip,
// renders a tiny back link, and mounts <UnitBuilder> for the
// interactive body. 404s when the unit doesn't exist or belongs
// to a programme the tutor doesn't own.
//
// URL: /tutor/programme/<programme_id>/curriculum/unit/<unit_id>

import Link from 'next/link';
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

  // Defensive: the route's programme_id should match the unit's
  // parent — if not, treat it as 404 (manually-typed URL trying to
  // reach a unit through the wrong programme).
  if (detail.programme.programme_id !== programme_id) notFound();

  return (
    <div className="unit-detail-page">
      <nav className="unit-detail-backlink">
        <Link href={`/tutor/programme/${programme_id}/curriculum`}>
          ← Back to curriculum
        </Link>
      </nav>

      <UnitBuilder
        unit={detail.unit}
        blocks={detail.blocks}
        activities={detail.activities}
        programmeUnitLabel={detail.programme.unit_label}
      />
    </div>
  );
}
