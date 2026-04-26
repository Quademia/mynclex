// mynclex/lib/access/tutor/require-tutor.ts
//
// Gate on the TUTOR role. SUPER_ADMIN bypasses (consistent with the
// product's design intent: tutor support and moderation by
// super-admins is part of the model).
// Failure → redirect to /no-access.
//
// Uses loadRolesOnly() (single DB round-trip).
//
// Note: this helper is NOT yet wired into app/(app)/tutor/layout.tsx
// — that layout still uses inline role-checking. Wiring tutor's
// layout would be a small policy change (current layout BOUNCES
// SUPER_ADMINs without TUTOR; this helper would let them through).
// Defer to a later slice when the SUPER_ADMIN-can-walk-tutor decision
// is explicit.

import { redirect } from 'next/navigation';
import { loadRolesOnly } from '../internal';
import type { AuthGateResult } from '../types';

export async function requireTutor(): Promise<AuthGateResult> {
  const ctx = await loadRolesOnly();

  const allowed =
    ctx.roles.includes('TUTOR') || ctx.roles.includes('SUPER_ADMIN');
  if (!allowed) {
    redirect('/no-access');
  }

  return ctx;
}
