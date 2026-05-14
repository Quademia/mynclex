// mynclex/lib/curriculum/unit-card.tsx
//
// Single unit card for the Units Overview grid. Slice 9.3a shipped
// this read-only; slice 9.3b wraps the whole surface as a clickable
// link into the Unit Builder via the same overlay-link pattern as
// <CohortCard> / <ProgrammeCard>.
//
// programmeId is needed for the link href — the unit row itself
// has programme_id, but passing it down explicitly keeps the card
// pure (no Supabase round trip).

import Link from 'next/link';
import type { UnitGridRow } from './types';
import type { UnitLabel } from '@/lib/programmes/types';
import {
  formatPublishedCounts,
  formatUnitCounts,
  formatUnitTitle,
  unitLabel,
  unitStatusLabel,
  unitStatusPillClass,
} from './format';

export function UnitCard({
  unit,
  programmeId,
  programmeUnitLabel,
}: {
  unit: UnitGridRow;
  programmeId: string;
  programmeUnitLabel: UnitLabel;
}) {
  const heading = unitLabel(unit.unit_index, programmeUnitLabel);
  const customTitle = formatUnitTitle(unit, programmeUnitLabel);
  const hasCustomTitle = customTitle !== heading;
  const isEmpty = unit.block_count === 0 && unit.activity_count === 0;

  const href = `/tutor/programme/${programmeId}/curriculum/unit/${unit.unit_id}`;

  return (
    <article
      className={
        isEmpty ? 'unit-card unit-card-empty' : 'unit-card'
      }
      aria-label={hasCustomTitle ? `${heading} — ${customTitle}` : heading}
    >
      <Link
        href={href}
        className="unit-card-link"
        aria-label={`Open ${hasCustomTitle ? customTitle : heading}`}
      >
        <span className="sr-only">
          Open {hasCustomTitle ? customTitle : heading}
        </span>
      </Link>

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
        {(() => {
          const live = formatPublishedCounts(
            unit.published_block_count,
            unit.block_count,
            unit.published_activity_count,
            unit.activity_count
          );
          return live ? (
            <span className="unit-card-meta unit-card-meta-live">
              {live}
            </span>
          ) : null;
        })()}
      </footer>
    </article>
  );
}
