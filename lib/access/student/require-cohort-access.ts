// mynclex/lib/access/student/require-cohort-access.ts
//
// Slice 10.1 — student-side gate for a specific cohort. Mirrors
// require-programme-access.ts but for the tutor-led delivery
// mode where the student's experience is cohort-scoped.
//
// Three checks, in order:
//   1. User holds the STUDENT role (requireStudent).
//   2. The cohort row is readable — metadata-tier RLS exposes a cohort
//      to a student iff they hold ANY enrolment row in THAT cohort
//      (access-gating step). No row → getCohortForShell returns null →
//      notFound() (404 doesn't leak existence).
//   3. That enrolment is ACTIVE (ENROLLED). A non-ENROLLED status
//      bounces back to the picker, where the switcher popup explains
//      the status. Safety net for direct-URL access; the primary UX is
//      the switcher hiding the entry.
//
// Returns the loaded cohort + programme shell + resolved status so
// callers don't refetch.

import { notFound, redirect } from 'next/navigation';
import {
  getCohortForShell,
  type CohortShellContext,
} from '@/lib/cohorts/queries';
import { getMyCohortEnrolmentStatus } from '@/lib/enrolments/queries';
import type { EnrolmentStatus } from '@/lib/enrolments/types';
import { requireStudent } from './require-student';
import type { AuthGateResult } from '../types';

export type StudentCohortAccessResult = AuthGateResult &
  CohortShellContext & { enrolmentStatus: EnrolmentStatus };

export async function requireStudentCohortAccess(
  cohortId: string
): Promise<StudentCohortAccessResult> {
  const ctx = await requireStudent();

  const cohortContext = await getCohortForShell(cohortId);
  if (!cohortContext) notFound();

  const status = await getMyCohortEnrolmentStatus(cohortId);
  if (status !== 'ENROLLED') redirect('/student/picker');

  return { ...ctx, ...cohortContext, enrolmentStatus: status };
}
