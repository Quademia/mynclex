// mynclex/lib/shell/load-chrome-data.ts
//
// Fetches everything an audience layout needs to render the AppShell:
// the authenticated user, their display name + email, the list of
// roles they hold, and the role they're currently "viewing as"
// (cookie-driven, with a sensible fallback). Redirects to /login if
// there's no user.
//
// Audience layouts call this once and pass the result to <AppShell>.
// They still do their own role-gate (e.g. STUDENT-only) on the
// returned `roles` array — this helper does NOT enforce a particular
// role; it just loads the chrome data common to every workspace page.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { type Role } from '@/components/shell/role-chip';

export type ChromeData = {
  userId: string;
  displayName: string;
  email: string;
  roles: Role[];
  viewingAs: Role;
};

// Fallback priority when the active-role cookie is missing or stale.
const ROLE_PRIORITY: Role[] = ['SUPER_ADMIN', 'ADMIN', 'TUTOR', 'STUDENT'];

export async function loadChromeData(): Promise<ChromeData> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [profileRes, rolesRes] = await Promise.all([
    supabase
      .from('nclex_users')
      .select('forename, surname, email')
      .eq('id', user.id)
      .maybeSingle(),
    supabase.from('nclex_user_roles').select('role').eq('user_id', user.id),
  ]);

  const profile = profileRes.data;
  const roles = (rolesRes.data ?? []).map((r) => r.role as Role);

  const displayName = profile
    ? `${profile.forename} ${profile.surname}`.trim()
    : user.email ?? '';
  const email = profile?.email ?? user.email ?? '';

  const cookieStore = await cookies();
  const activeRoleCookie = cookieStore.get('nclex_active_role')?.value as
    | Role
    | undefined;

  const viewingAs = pickViewingAs(roles, activeRoleCookie);

  return { userId: user.id, displayName, email, roles, viewingAs };
}

function pickViewingAs(roles: Role[], cookie: Role | undefined): Role {
  if (cookie && roles.includes(cookie)) return cookie;
  const fallback = ROLE_PRIORITY.find((r) => roles.includes(r));
  // If a user with zero roles ever slips past upstream gates, default
  // to STUDENT so the chrome doesn't crash. The page-level role check
  // will bounce them to /no-access immediately anyway.
  return fallback ?? 'STUDENT';
}
