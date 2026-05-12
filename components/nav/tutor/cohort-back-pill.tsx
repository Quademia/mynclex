// mynclex/components/nav/tutor/cohort-back-pill.tsx
//
// Topbar context pill rendered inside a cohort workspace. Mirrors
// <TutorBackPill> (the programme version) but goes one level up to
// the parent programme's Cohorts tab (where the user clicked into
// this cohort from). One-level back-pill per the 9.2c planning
// conversation — Programme title is the destination; the cohort
// identity is already visible in the sidebar header and topbar
// title slot.

import Link from 'next/link';
import { NavIcon } from '@/components/nav/shared/nav-icon';

export function TutorCohortBackPill({
  programmeId,
  programmeTitle,
}: {
  programmeId: string;
  programmeTitle: string;
}) {
  return (
    <div className="back-pill-wrap">
      <Link
        href={`/tutor/programme/${programmeId}/cohorts`}
        className="back-pill"
        aria-label={`Back to ${programmeTitle} cohorts`}
      >
        <NavIcon name="arrow-left" />
        <span>{programmeTitle}</span>
      </Link>
    </div>
  );
}
