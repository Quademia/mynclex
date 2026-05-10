// mynclex/lib/programmes/programme-card.tsx
//
// Server component — pure presentation + a client-component edit
// trigger. Uses the "overlay link" pattern so the whole card is a
// hyperlink to /tutor/programme/<id>/overview while the in-card
// Edit button stays interactive (z-index trick).
//
// Layout:
//   .programme-card (relative)
//     <Link>             — absolute, inset:0, z:1 (the card link)
//     .programme-card-head
//       .programme-card-title
//       .programme-card-actions   — relative, z:2 (above the link)
//         .programme-pill
//         <EditProgrammeTrigger>  — pencil icon
//     .programme-card-tagline
//     .programme-card-foot
//       .programme-card-meta
//       .programme-card-schedule

import Link from 'next/link';
import type { ProgrammeListRow } from './types';
import {
  formatSchedule,
  formatStudents,
  formatStatusLabel,
  statusPillClass,
} from './format';
import { EditProgrammeTrigger } from './edit-programme-trigger';

export function ProgrammeCard({ programme }: { programme: ProgrammeListRow }) {
  const isMuted =
    programme.status === 'ARCHIVED' || programme.status === 'CANCELLED';

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
          {formatStudents(programme.cohort_size)}
        </span>
        <span className="programme-card-schedule">
          {formatSchedule(
            programme.start_date,
            programme.end_date,
            programme.length_weeks
          )}
        </span>
      </div>
    </div>
  );
}
