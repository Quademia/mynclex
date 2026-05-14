// mynclex/lib/access/student/require-cohort-access.ts
//
// Slice 10.1 — student-side gate for a specific cohort. Mirrors
// require-programme-access.ts but for the tutor-led delivery
// mode where the student's experience is cohort-scoped.
//
// Three checks in one:
//   1. User holds the STUDENT role.
//   2. The cohort row is readable (RLS exposes cohorts whose
//      parent programme is PUBLISHED — slice 10.1 student SELECT
//      policy on nclex_cohorts).
//   3. The cohort's parent programme is PUBLISHED — already
//      enforced by RLS; the loaded programme is returned for the
//      caller's use.
//
// Permissive shape (v1): any STUDENT user can access any cohort
// of any PUBLISHED programme. Enrolment-aware tightening happens
// in the enrolment slice — both layers (RLS + this helper)
// gain an enrolment lookup at the same time.
//
// Returns the loaded cohort + programme shell so callers don't
// refetch. Cohort not found / parent not PUBLISHED → notFound()
// (same 404 response so existence doesn't leak).

import { notFound } from 'next/navigation';
import {
  getCohortForShell,
  type CohortShellContext,
} from '@/lib/cohorts/queries';
import { requireStudent } from './require-student';
import type { AuthGateResult } from '../types';

export type StudentCohortAccessResult = AuthGateResult & CohortShellContext;

export async function requireStudentCohortAccess(
  cohortId: string
): Promise<StudentCohortAccessResult> {
  const ctx = await requireStudent();

  const cohortContext = await getCohortForShell(cohortId);
  if (!cohortContext) notFound();

  return { ...ctx, ...cohortContext };
}
