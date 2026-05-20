// mynclex/lib/access/student/require-programme-access.ts
//
// Student-side gate for a specific (self-paced) programme. Three
// checks, in order:
//   1. User holds the STUDENT role (requireStudent).
//   2. The programme is readable — metadata-tier RLS exposes a
//      programme to a student iff they hold ANY enrolment row for it
//      (access-gating step). No row → getProgrammeForShell returns
//      null → notFound() (404 doesn't leak existence).
//   3. That enrolment is ACTIVE (ENROLLED). A non-ENROLLED status
//      (Pending / Paused / Cancelled / Expired) bounces back to the
//      picker, where the switcher popup explains the status. This is
//      the safety net for someone typing/bookmarking the URL directly;
//      the primary UX is the switcher hiding the entry.
//
// Returns the loaded programme shell + the resolved status so callers
// don't refetch.

import { notFound, redirect } from 'next/navigation';
import {
  getProgrammeForShell,
  type ProgrammeShellContext,
} from '@/lib/programmes/queries';
import { getMyProgrammeEnrolmentStatus } from '@/lib/enrolments/queries';
import type { EnrolmentStatus } from '@/lib/enrolments/types';
import { requireStudent } from './require-student';
import type { AuthGateResult } from '../types';

export type StudentProgrammeAccessResult = AuthGateResult & {
  programme: ProgrammeShellContext;
  enrolmentStatus: EnrolmentStatus;
};

export async function requireStudentProgrammeAccess(
  programmeId: string
): Promise<StudentProgrammeAccessResult> {
  const ctx = await requireStudent();

  const programme = await getProgrammeForShell(programmeId);
  if (!programme) notFound();

  const status = await getMyProgrammeEnrolmentStatus(programmeId);
  if (status !== 'ENROLLED') redirect('/student/picker');

  return { ...ctx, programme, enrolmentStatus: status };
}
