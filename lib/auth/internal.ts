// mynclex/lib/auth/internal.ts
//
// Module-internal loaders. NOT re-exported through the barrel — pages
// and actions should never call these directly. They power the public
// require-* helpers so the auth-context fetch (and the redirect on
// no-user side effect) is centralised.
//
// Two flavours:
//
//   loadAuthContext()  — fetches roles AND admin permissions in
//                        parallel. Used by gates that need permission
//                        data (e.g. requireAdminPermission,
//                        requireBankCurator on the admin surface).
//
//   loadRolesOnly()    — fetches roles only. Used by gates that don't
//                        check permission buckets (requireAnyAdmin,
//                        requireSuperAdmin, requireTutor,
//                        requireBankCurator on the tutor surface).
//                        Saves one DB round-trip per request.
//
// Both bounce unauthenticated callers to /login.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { AuthGateResult } from './types';

/**
 * Fetch the auth user, their roles, and their admin permissions in
 * parallel. Bounces unauthenticated callers to /login.
 */
export async function loadAuthContext(): Promise<AuthGateResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const [rolesRes, permsRes] = await Promise.all([
    supabase.from('nclex_user_roles').select('role').eq('user_id', user.id),
    supabase
      .from('nclex_admin_permissions')
      .select('permission')
      .eq('user_id', user.id),
  ]);

  const roles = (rolesRes.data ?? []).map((r) => r.role as string);
  const permissions = (permsRes.data ?? []).map((p) => p.permission as string);

  return { supabase, user, roles, permissions };
}

/**
 * Fetch the auth user and their roles only. Bounces unauthenticated
 * callers to /login. Returns the same AuthGateResult shape with an
 * empty `permissions` array so call sites don't need to narrow.
 */
export async function loadRolesOnly(): Promise<AuthGateResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const { data: rolesData } = await supabase
    .from('nclex_user_roles')
    .select('role')
    .eq('user_id', user.id);

  const roles = (rolesData ?? []).map((r) => r.role as string);

  return { supabase, user, roles, permissions: [] };
}
