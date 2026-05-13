// mynclex/lib/access/student/require-student.ts
//
// Gate on the STUDENT role. No SUPER_ADMIN bypass — admins use
// their own surface; the student space is the learner experience
// and admins viewing it would muddy the test surface.
// Failure → redirect to /no-access.
//
// Uses loadRolesOnly() (single DB round-trip). Slice 10.1 — the
// first student-side gate. Future helpers in this folder layer
// resource-level checks (programme/cohort access) on top of it.

import { redirect } from 'next/navigation';
import { loadRolesOnly } from '../internal';
import type { AuthGateResult } from '../types';

export async function requireStudent(): Promise<AuthGateResult> {
  const ctx = await loadRolesOnly();

  if (!ctx.roles.includes('STUDENT')) {
    redirect('/no-access');
  }

  return ctx;
}
