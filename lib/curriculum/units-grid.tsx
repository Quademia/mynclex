// mynclex/lib/curriculum/units-grid.tsx
//
// Units Overview grid for the curriculum tab (slice 9.3a, mockup
// screen 3). Pre-slotted with N cards (where N = programme.length_
// units) — the backfill in 9.3a guarantees that count exists.
//
// Slice 9.3b — each card is now a clickable overlay link into the
// Unit Builder (`/curriculum/unit/<unit_id>`). The grid container
// stays unchanged; the link is inside <UnitCard>.

import { UnitCard } from './unit-card';
import type { UnitGridRow } from './types';
import type { UnitLabel } from '@/lib/programmes/types';

export function UnitsGrid({
  units,
  programmeId,
  programmeUnitLabel,
}: {
  units: UnitGridRow[];
  programmeId: string;
  programmeUnitLabel: UnitLabel;
}) {
  return (
    <div className="units-grid" role="list">
      {units.map((unit) => (
        <div key={unit.unit_id} role="listitem">
          <UnitCard
            unit={unit}
            programmeId={programmeId}
            programmeUnitLabel={programmeUnitLabel}
          />
        </div>
      ))}
    </div>
  );
}
