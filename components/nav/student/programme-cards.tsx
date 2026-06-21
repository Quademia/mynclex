// mynclex/components/nav/student/programme-cards.tsx
//
// Rich programme cards for the student picker's "Your programmes" lane
// (Rails redesign, 2026-06). Picker-specific so the shared
// <ProgrammeList> (used by the in-app switch-popup) stays untouched.
//
// Same data + gating as the popup — it reuses the shared helpers
// (canEnterStatus, ENROLMENT_LOCKED_REASON, ENROLMENT_STATUS_META) and
// the InstallmentCta — just a richer card presentation:
//   • Self-paced  → one card, Open / locked-reason + Pay.
//   • Tutor-led   → programme card + its cohort rows (per-cohort status +
//     Enter), so multi-cohort / dates aren't lost (vs the prototype's
//     "collapse to the first cohort").
//
// Server component: navigation is a plain <Link> and the only
// interactive child is InstallmentCta (its own client island), so the
// cards need no client JS of their own.

import Link from 'next/link';
import { InstallmentCta } from '@/lib/payments/installment-cta';
import type { SwitcherProgramme } from '@/lib/programmes/student-actions';
import {
  ENROLMENT_STATUS_META,
  ENROLMENT_LOCKED_REASON,
  canEnterStatus,
  type EnrolmentStatus,
} from '@/lib/enrolments/types';

function StatusPill({ status }: { status: EnrolmentStatus | null }) {
  if (!status) return null;
  const meta = ENROLMENT_STATUS_META[status];
  return <span className={`enrol-pill ${meta.pillClass}`}>{meta.label}</span>;
}

function lockedReasonFor(status: EnrolmentStatus | null): string | null {
  if (!status || status === 'ENROLLED') return null;
  return ENROLMENT_LOCKED_REASON[status];
}

export function ProgrammeCards({
  programmes,
}: {
  programmes: SwitcherProgramme[];
}) {
  return (
    <div className="pcards">
      {programmes.map((p) => {
        const isSelf = p.delivery_mode === 'SELF_PACED';
        const unitNoun = p.unit_label === 'WEEK' ? 'weeks' : 'modules';
        const meta = `${p.length_units} ${unitNoun} · ${
          isSelf ? 'Self-paced' : 'Tutor-led'
        }`;

        return (
          <article key={p.programme_id} className="pcard">
            <div className="pcard-head">
              <span className={`pcard-chip ${isSelf ? 'is-self' : 'is-tutor'}`}>
                {isSelf ? 'Self-paced' : 'Tutor-led'}
              </span>
              {/* Self-paced status lives on the programme; tutor-led status
                  lives per-cohort (shown on each cohort row below). */}
              {isSelf && <StatusPill status={p.status} />}
            </div>

            <h3 className="pcard-title">{p.title}</h3>
            {p.tagline && <p className="pcard-tagline">{p.tagline}</p>}
            <p className="pcard-meta">{meta}</p>

            {isSelf ? (
              <SelfPacedFoot programme={p} />
            ) : (
              <TutorLedCohorts programme={p} />
            )}
          </article>
        );
      })}
    </div>
  );
}

function SelfPacedFoot({ programme: p }: { programme: SwitcherProgramme }) {
  if (canEnterStatus(p.status)) {
    return (
      <div className="pcard-foot">
        <Link
          className="pcard-enter"
          href={`/student/programme/${p.programme_id}/curriculum`}
        >
          Open <span aria-hidden="true">→</span>
        </Link>
      </div>
    );
  }
  const reason = lockedReasonFor(p.status);
  return (
    <div className="pcard-foot is-locked">
      {reason && <p className="pcard-locked-reason">{reason}</p>}
      <InstallmentCta next={p.nextPayment} canPayOnline={p.canPayOnline} />
    </div>
  );
}

function TutorLedCohorts({ programme: p }: { programme: SwitcherProgramme }) {
  if (p.cohorts.length === 0) {
    return <p className="pcard-empty">No cohorts scheduled yet.</p>;
  }
  return (
    <div className="pcard-cohorts">
      {p.cohorts.map((c) => {
        const canEnter = canEnterStatus(c.status);
        const reason = lockedReasonFor(c.status);
        return (
          <div key={c.cohort_id} className="pcard-cohort">
            <div className="pcard-cohort-head">
              <span className="pcard-cohort-main">
                <span className="pcard-cohort-name">
                  {c.name ?? `${c.start_date} → ${c.end_date}`}
                </span>
                <span className="pcard-cohort-dates">
                  {c.start_date} → {c.end_date}
                </span>
              </span>
              <span className="pcard-cohort-right">
                <StatusPill status={c.status} />
                {canEnter && (
                  <Link
                    className="pcard-enter is-sm"
                    href={`/student/cohort/${c.cohort_id}/curriculum`}
                  >
                    Enter <span aria-hidden="true">→</span>
                  </Link>
                )}
              </span>
            </div>
            {reason && <p className="pcard-locked-reason">{reason}</p>}
            <InstallmentCta next={c.nextPayment} canPayOnline={c.canPayOnline} />
          </div>
        );
      })}
    </div>
  );
}
