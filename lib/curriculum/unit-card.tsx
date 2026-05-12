// mynclex/lib/curriculum/unit-card.tsx
//
// Single unit card for the Units Overview grid (slice 9.3a).
// Read-only in this slice — no edit affordance, no link to a unit
// detail page (the detail page is 9.3b). Empty cards render with a
// dashed border so the grid's structure is visible even when every
// slot is unfilled.

import type { UnitGridRow } from './types';
import type { UnitLabel } from '@/lib/programmes/types';
import {
  formatUnitCounts,
  formatUnitTitle,
  unitLabel,
  unitStatusLabel,
  unitStatusPillClass,
} from './format';

export function UnitCard({
  unit,
  programmeUnitLabel,
}: {
  unit: UnitGridRow;
  programmeUnitLabel: UnitLabel;
}) {
  const heading = unitLabel(unit.unit_index, programmeUnitLabel);
  const customTitle = formatUnitTitle(unit, programmeUnitLabel);
  const hasCustomTitle = customTitle !== heading;
  const isEmpty = unit.block_count === 0 && unit.activity_count === 0;

  return (
    <article
      className={
        isEmpty ? 'unit-card unit-card-empty' : 'unit-card'
      }
      aria-label={hasCustomTitle ? `${heading} — ${customTitle}` : heading}
    >
      <header className="unit-card-head">
        <span className="unit-card-index">{heading}</span>
        <span className={`unit-pill ${unitStatusPillClass(unit.is_published)}`}>
          {unitStatusLabel(unit.is_published)}
        </span>
      </header>

      {hasCustomTitle ? (
        <h3 className="unit-card-title">{customTitle}</h3>
      ) : (
        <h3 className="unit-card-title unit-card-title-empty">
          Untitled
        </h3>
      )}

      {unit.description && (
        <p className="unit-card-desc">{unit.description}</p>
      )}

      <footer className="unit-card-foot">
        <span className="unit-card-meta">
          {formatUnitCounts(unit.block_count, unit.activity_count)}
        </span>
      </footer>
    </article>
  );
}
