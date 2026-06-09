// mynclex/lib/programmes/programme-card.tsx
//
// Server component — one programme card on the Programmes list. Uses
// the "overlay link" pattern so the whole card opens the programme
// (/tutor/programme/<id>/overview) while the Edit pencil + "Add first
// cohort" button stay independently clickable (pointer-events handled
// in CSS; the overlay link sits at z-index 1).
//
// CD uplift (programmes list redesign): tagline under title, a shape
// line, a completion meter + health (live tutor-led with an active
// cohort), state-aware foot (self-paced / zero-cohort / draft / normal),
// and a price. Completion data comes from getMyProgrammesForList.

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { ProgrammeCardRow } from './types';
import {
  formatHealthLabel,
  formatLength,
  formatPrice,
  formatShortDate,
  formatStatusLabel,
  statusPillClass,
} from './format';
import { ProgIcon } from './prog-icon';
import { ProgrammeCardMenu } from './programme-card-menu';
import { NewCohortTrigger } from '@/lib/cohorts/new-cohort-trigger';

export function ProgrammeCard({ programme }: { programme: ProgrammeCardRow }) {
  const archived = programme.status === 'ARCHIVED';
  const draft = programme.status === 'DRAFT';
  const live = programme.status === 'PUBLISHED';
  const selfPaced = programme.delivery_mode === 'SELF_PACED';
  const modeClass = selfPaced ? 'mode-selfpaced' : 'mode-tutored';
  // "Add first cohort" surfaces on any tutor-led programme with no cohort
  // yet — draft OR live (you can set up cohorts before publishing; the
  // Overview cohort-empty CTA behaves the same). Archived is excluded.
  const zeroCohort = !selfPaced && !archived && programme.cohort_count === 0;
  const hasMeter =
    live && !selfPaced && programme.cohort_count > 0 && programme.avgCompletion != null && !!programme.health;

  // Tutor-led schedule / warning line — only when the programme has at
  // least one cohort (the zero-cohort state shows the Add-cohort nudge in
  // the foot instead). Self-paced + archived never show it.
  let scheduleNode: ReactNode = null;
  if (!selfPaced && !archived && !zeroCohort) {
    if (!programme.hasOpenCohort) {
      scheduleNode = (
        <div className="programme-card-warn">
          <ProgIcon name="alert" size={14} /> No open cohorts — students can’t
          enrol yet
        </div>
      );
    } else if (programme.nextCohortStart) {
      scheduleNode = (
        <div className="programme-card-schedule">
          <ProgIcon name="calendar" size={13} /> Next cohort starts{' '}
          <b>{formatShortDate(programme.nextCohortStart)}</b>
        </div>
      );
    } else {
      scheduleNode = (
        <div className="programme-card-schedule">
          <ProgIcon name="calendar" size={13} /> Cohort in progress
        </div>
      );
    }
  }

  // Coloured mode edge on active cards only (archived stay quiet/muted).
  let cardCls = 'programme-card';
  if (archived) cardCls += ' is-muted';
  else {
    cardCls += ` ${modeClass}`;
    if (draft) cardCls += ' is-draft';
  }

  return (
    <div className={cardCls}>
      <Link
        href={`/tutor/programme/${programme.programme_id}/overview`}
        className="programme-card-link"
        aria-label={`Open ${programme.title}`}
      >
        <span className="sr-only">Open {programme.title}</span>
      </Link>

      <span className={`programme-card-mode ${modeClass}`}>
        <ProgIcon name={selfPaced ? 'zap' : 'users'} size={12} />
        {selfPaced ? 'Self-paced' : 'Tutor-led'}
      </span>

      <div className="programme-card-head">
        <div className="programme-card-titlewrap">
          <h2 className="programme-card-title">{programme.title}</h2>
          {programme.tagline && (
            <p className="programme-card-tagline">{programme.tagline}</p>
          )}
        </div>
        <div className="programme-card-actions">
          <span className={`programme-pill ${statusPillClass(programme.status)}`}>
            {formatStatusLabel(programme.status)}
          </span>
          {!archived && <ProgrammeCardMenu programme={programme} />}
        </div>
      </div>

      <div className="programme-card-shape">
        <ProgIcon name="layers" size={13} />
        {formatLength(programme.length_units, programme.unit_label)}
        {selfPaced ? ' · self-paced' : ''}
      </div>

      {scheduleNode}

      {hasMeter && (
        <div className="programme-meter-row">
          <div
            className="programme-meter"
            title={`${programme.avgCompletion}% average completion`}
          >
            <span
              className={`programme-meter-fill health-${programme.health}`}
              style={{ width: `${programme.avgCompletion}%` }}
            />
          </div>
          <span className={`programme-health health-${programme.health}`}>
            {formatHealthLabel(programme.health!)} · {programme.avgCompletion}% avg
          </span>
        </div>
      )}

      <div className="programme-card-foot">
        {selfPaced ? (
          <span className="programme-card-meta is-selfpaced">
            <ProgIcon name="zap" size={13} /> Self-paced · {programme.students} enrolled
          </span>
        ) : zeroCohort ? (
          <NewCohortTrigger
            programmeId={programme.programme_id}
            programmeLengthUnits={programme.length_units}
            variant="card"
          />
        ) : (
          <span className="programme-card-meta">
            {programme.cohort_count} {programme.cohort_count === 1 ? 'cohort' : 'cohorts'} ·{' '}
            {programme.students} students
          </span>
        )}
        <span
          className={'programme-card-price' + (programme.upfront_total_minor === 0 ? ' is-free' : '')}
        >
          {formatPrice(programme.upfront_total_minor, programme.price_currency)}
        </span>
      </div>
    </div>
  );
}
