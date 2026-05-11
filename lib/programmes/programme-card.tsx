// mynclex/lib/programmes/programme-card.tsx
//
// Server component — pure presentation + a client-component edit
// trigger. Uses the "overlay link" pattern so the whole card is a
// hyperlink to /tutor/programme/<id>/overview while the in-card
// Edit button stays interactive (z-index trick).
//
// Slice 9.2a: schedule line replaced by cohort-count line +
// programme-length shape line (since dates now belong to cohorts).
// Real per-cohort schedule rendering lands with the Cohorts tab
// in 9.2c.

import Link from 'next/link';
import type { ProgrammeListRow } from './types';
import {
  formatCohortCount,
  formatLength,
  formatStatusLabel,
  statusPillClass,
} from './format';
import { EditProgrammeTrigger } from './edit-programme-trigger';

export function ProgrammeCard({ programme }: { programme: ProgrammeListRow }) {
  const isMuted = programme.status === 'ARCHIVED';
  const isSelfPaced = programme.delivery_mode === 'SELF_PACED';

  return (
    <div className={`programme-card ${isMuted ? 'is-muted' : ''}`}>
      <Link
        href={`/tutor/programme/${programme.programme_id}/overview`}
        className="programme-card-link"
        aria-label={`Open ${programme.title}`}
      >
        <span className="sr-only">Open {programme.title}</span>
      </Link>

      <div className="programme-card-head">
        <h2 className="programme-card-title">{programme.title}</h2>
        <div className="programme-card-actions">
          <span className={`programme-pill ${statusPillClass(programme.status)}`}>
            {formatStatusLabel(programme.status)}
          </span>
          <EditProgrammeTrigger programme={programme} />
        </div>
      </div>

      {programme.tagline && (
        <p className="programme-card-tagline">{programme.tagline}</p>
      )}

      <div className="programme-card-foot">
        <span className="programme-card-meta">
          {formatLength(programme.length_units, programme.unit_label)}
        </span>
        <span className="programme-card-schedule">
          {isSelfPaced
            ? 'Self-paced'
            : formatCohortCount(programme.cohort_count)}
        </span>
      </div>
    </div>
  );
}
