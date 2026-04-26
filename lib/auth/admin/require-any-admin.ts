// mynclex/lib/auth/admin/require-any-admin.ts
//
// Gate on ADMIN or SUPER_ADMIN role. No specific permission required.
// Used by /admin/dashboard, the parent /admin/layout.tsx role gate,
// and any future "summary" routes that don't gate on a single bucket.
//
// Failure → redirect to /no-access (consistent with the parent layout
// gate — "you don't belong in /admin at all" is a different failure
// mode from "you're an admin but lack this specific bucket", which
// goes to /admin/dashboard).
//
// Uses loadRolesOnly() (single DB round-trip).

import { redirect } from 'next/navigation';
import { loadRolesOnly } from '../internal';
import type { AuthGateResult } from '../types';

export async function requireAnyAdmin(): Promise<AuthGateResult> {
  const ctx = await loadRolesOnly();

  const isAdmin =
    ctx.roles.includes('ADMIN') || ctx.roles.includes('SUPER_ADMIN');
  if (!isAdmin) {
    redirect('/no-access');
  }

  return ctx;
}
