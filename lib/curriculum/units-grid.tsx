// mynclex/lib/curriculum/units-grid.tsx
//
// Units Overview grid for the curriculum tab (slice 9.3a, mockup
// screen 3). Pre-slotted with N cards (where N = programme.length_
// units) — the backfill in 9.3a guarantees that count exists.
//
// Read-only in this slice. Editing surfaces (unit detail, activity
// picker, editors) land in 9.3b onwards.

import { UnitCard } from './unit-card';
import type { UnitGridRow } from './types';
import type { UnitLabel } from '@/lib/programmes/types';

export function UnitsGrid({
  units,
  programmeUnitLabel,
}: {
  units: UnitGridRow[];
  programmeUnitLabel: UnitLabel;
}) {
  return (
    <div className="units-grid" role="list">
      {units.map((unit) => (
        <div key={unit.unit_id} role="listitem">
          <UnitCard
            unit={unit}
            programmeUnitLabel={programmeUnitLabel}
          />
        </div>
      ))}
    </div>
  );
}
