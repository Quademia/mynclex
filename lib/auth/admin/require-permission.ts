// mynclex/lib/auth/admin/require-permission.ts
//
// Gate a Server Component or Server Action on a specific admin
// permission bucket. SUPER_ADMIN bypasses the check (mirrors the
// nclex_user_has_permission() SQL helper's short-circuit in
// db/rls.sql). Failure → redirect to /admin/dashboard.
//
// The `permission` parameter is typed as AdminPermission (the union
// of constants from ../constants) — bare string literals don't
// compile. Adding a new bucket means editing constants.ts; that's
// the one place to change.
//
// Usage:
//   import { requireAdminPermission, PERM_USERS_MANAGE } from '@/lib/auth';
//   const { user, supabase } = await requireAdminPermission(PERM_USERS_MANAGE);

import { redirect } from 'next/navigation';
import { loadAuthContext } from '../internal';
import type { AuthGateResult } from '../types';
import type { AdminPermission } from '../constants';

export async function requireAdminPermission(
  permission: AdminPermission,
): Promise<AuthGateResult> {
  const ctx = await loadAuthContext();

  const allowed =
    ctx.roles.includes('SUPER_ADMIN') || ctx.permissions.includes(permission);

  if (!allowed) {
    redirect('/admin/dashboard');
  }

  return ctx;
}
