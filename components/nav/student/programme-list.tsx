// mynclex/components/nav/student/programme-list.tsx
//
// Shared renderer for a student's enrolled programmes + cohorts. One
// source of truth used by two surfaces:
//   • the picker (lists programmes inline on the landing page)
//   • the programme-switcher overlay (the in-app "switch programme"
//     popup, opened from the sidebar + topbar)
//
// Both feed it the same getMyAccessibleProgrammesAction() shape. A row
// is enterable only when its enrolment status is ENROLLED (access
// gating); every other status renders dimmed + non-clickable with a
// status pill and a why-it's-locked line. Navigation is router.push so
// the overlay can also close itself via onNavigate.

'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SwitcherProgramme } from '@/lib/programmes/student-actions';
import { InstallmentCta } from '@/lib/payments/installment-cta';
import {
  ENROLMENT_STATUS_META,
  ENROLMENT_LOCKED_REASON,
  canEnterStatus as canEnter,
  type EnrolmentStatus,
} from '@/lib/enrolments/types';

function StatusPill({ status }: { status: EnrolmentStatus | null }) {
  if (!status) return null;
  const meta = ENROLMENT_STATUS_META[status];
  return <span className={`enrol-pill ${meta.pillClass}`}>{meta.label}</span>;
}

function LockedReason({ status }: { status: EnrolmentStatus | null }) {
  if (!status || status === 'ENROLLED') return null;
  return (
    <div className="programme-switcher-locked-reason">
      {ENROLMENT_LOCKED_REASON[status]}
    </div>
  );
}

export function ProgrammeList({
  programmes,
  onNavigate,
}: {
  programmes: SwitcherProgramme[];
  // Called after a successful navigation — the overlay uses it to close
  // itself; the picker omits it (nothing to close).
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function go(href: string) {
    startTransition(() => {
      router.push(href);
      onNavigate?.();
    });
  }

  return (
    <ul className="programme-switcher-list">
      {programmes.map((p) => {
        const unitNoun = p.unit_label === 'WEEK' ? 'weeks' : 'modules';
        const meta = `${p.length_units} ${unitNoun} · ${
          p.delivery_mode === 'SELF_PACED' ? 'Self-paced' : 'Tutor-led'
        }`;

        if (p.delivery_mode === 'SELF_PACED') {
          const inner = (
            <>
              <div className="programme-switcher-item-titlerow">
                <span className="programme-switcher-item-title">
                  {p.title}
                </span>
                <StatusPill status={p.status} />
              </div>
              {p.tagline && (
                <div className="programme-switcher-item-tagline">
                  {p.tagline}
                </div>
              )}
              <div className="programme-switcher-item-meta">{meta}</div>
              <LockedReason status={p.status} />
            </>
          );
          return (
            <li key={p.programme_id}>
              {canEnter(p.status) ? (
                <button
                  type="button"
                  className="programme-switcher-item is-clickable"
                  onClick={() =>
                    go(`/student/programme/${p.programme_id}/curriculum`)
                  }
                >
                  {inner}
                </button>
              ) : (
                <div
                  className="programme-switcher-item is-locked"
                  aria-disabled="true"
                >
                  {inner}
                </div>
              )}
              <InstallmentCta next={p.nextPayment} canPayOnline={p.canPayOnline} />
            </li>
          );
        }

        // TUTOR_LED — programme card is informational; cohorts below are
        // the clickable rows.
        return (
          <li key={p.programme_id}>
            <div className="programme-switcher-item">
              <div className="programme-switcher-item-title">{p.title}</div>
              {p.tagline && (
                <div className="programme-switcher-item-tagline">
                  {p.tagline}
                </div>
              )}
              <div className="programme-switcher-item-meta">{meta}</div>
              {p.cohorts.length === 0 ? (
                <div className="programme-switcher-cohorts-empty">
                  No cohorts scheduled yet.
                </div>
              ) : (
                <ul className="programme-switcher-cohorts">
                  {p.cohorts.map((c) => {
                    const cohortInner = (
                      <>
                        <span className="programme-switcher-cohort-name">
                          {c.name ?? `${c.start_date} → ${c.end_date}`}
                        </span>
                        <span className="programme-switcher-cohort-right">
                          <StatusPill status={c.status} />
                          <span className="programme-switcher-cohort-dates">
                            {c.start_date} → {c.end_date}
                          </span>
                        </span>
                      </>
                    );
                    return (
                      <li key={c.cohort_id}>
                        {canEnter(c.status) ? (
                          <button
                            type="button"
                            className="programme-switcher-cohort"
                            onClick={() =>
                              go(`/student/cohort/${c.cohort_id}/curriculum`)
                            }
                          >
                            {cohortInner}
                          </button>
                        ) : (
                          <div
                            className="programme-switcher-cohort is-locked"
                            aria-disabled="true"
                          >
                            {cohortInner}
                          </div>
                        )}
                        <LockedReason status={c.status} />
                        <InstallmentCta next={c.nextPayment} canPayOnline={c.canPayOnline} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
