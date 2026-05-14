// mynclex/lib/access/student/require-programme-access.ts
//
// Slice 10.1 — student-side gate for a specific programme. Two
// checks in one:
//   1. User holds the STUDENT role.
//   2. The programme is readable (RLS exposes only PUBLISHED
//      programmes to students — slice 10.1 student SELECT
//      policies in db/rls.sql + the slice migration).
//
// Permissive shape (v1): any STUDENT user can access any
// PUBLISHED programme — there's no enrolment table yet. When the
// enrolment slice ships, the body adds an explicit enrolment
// lookup AND the matching RLS policy USING clause tightens to
// require an enrolment row. Both layers move together.
//
// Returns the loaded programme shell so callers don't refetch.
// Failure modes:
//   - No STUDENT role            → redirect to /no-access (via
//                                   requireStudent).
//   - Programme not found / not  → notFound() (404). Same
//     PUBLISHED                    response either way so a 404
//                                   doesn't leak existence of a
//                                   DRAFT/ARCHIVED programme.

import { notFound } from 'next/navigation';
import {
  getProgrammeForShell,
  type ProgrammeShellContext,
} from '@/lib/programmes/queries';
import { requireStudent } from './require-student';
import type { AuthGateResult } from '../types';

export type StudentProgrammeAccessResult = AuthGateResult & {
  programme: ProgrammeShellContext;
};

export async function requireStudentProgrammeAccess(
  programmeId: string
): Promise<StudentProgrammeAccessResult> {
  const ctx = await requireStudent();

  const programme = await getProgrammeForShell(programmeId);
  if (!programme) notFound();

  return { ...ctx, programme };
}
