// mynclex/lib/access/admin/require-super-admin.ts
//
// Gate on the SUPER_ADMIN role specifically (NOT a permission
// bucket). The Permissions page is the canonical caller — it grants
// every other bucket, so by definition no permission can gate it.
// Failure → redirect to /admin/dashboard.
//
// Uses loadRolesOnly() (single DB round-trip) — SUPER_ADMIN check
// doesn't need permission data. The permissions field on the result
// is always [] for this helper; call sites that need actual
// permissions should use requireAdminPermission instead.

import { redirect } from 'next/navigation';
import { loadRolesOnly } from '../internal';
import type { AuthGateResult } from '../types';

export async function requireSuperAdmin(): Promise<AuthGateResult> {
  const ctx = await loadRolesOnly();

  if (!ctx.roles.includes('SUPER_ADMIN')) {
    redirect('/admin/dashboard');
  }

  return ctx;
}
