// mynclex/app/admin/page.tsx
//
// Admin dashboard — serves both ADMIN and SUPER_ADMIN roles.
// SUPER_ADMIN users see an extra "super-admin" section via a simple
// conditional render. Per-permission gates (via nclex_user_has_permission)
// will land as real admin tasks surface.

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { RoleSwitcher, type Role } from '@/components/role-switcher';
import '../landing.css';
import '../dashboards.css';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [profileRes, rolesRes] = await Promise.all([
    supabase
      .from('nclex_users')
      .select('forename, surname')
      .eq('id', user.id)
      .maybeSingle(),
    supabase.from('nclex_user_roles').select('role').eq('user_id', user.id),
  ]);

  const profile = profileRes.data;
  const roles = (rolesRes.data ?? []).map((r) => r.role as Role);

  const holdsSuperAdmin = roles.includes('SUPER_ADMIN');
  const holdsAdmin = roles.includes('ADMIN');

  if (!holdsAdmin && !holdsSuperAdmin) {
    redirect('/no-access');
  }

  // Which admin-level role is the user currently "viewing as"?
  // Drives the badge, the extras section, and the role-switcher label.
  // Source of truth: the `nclex_active_role` cookie set at /pick-role or
  // via the switcher. Falls back to the higher-priority role the user
  // actually holds if the cookie is missing or points somewhere else.
  const cookieStore = await cookies();
  const activeRoleCookie = cookieStore.get('nclex_active_role')?.value;

  let viewingAs: 'SUPER_ADMIN' | 'ADMIN';
  if (activeRoleCookie === 'ADMIN' && holdsAdmin) {
    viewingAs = 'ADMIN';
  } else if (activeRoleCookie === 'SUPER_ADMIN' && holdsSuperAdmin) {
    viewingAs = 'SUPER_ADMIN';
  } else {
    viewingAs = holdsSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN';
  }

  const displayName = profile
    ? `${profile.forename} ${profile.surname}`
    : user.email ?? 'there';

  const isSuperAdmin = viewingAs === 'SUPER_ADMIN';

  return (
    <main className="dash-main">
      <section className="dash-card">
        <div className="dash-header">
          <h1 className="dash-title">Welcome, {displayName}</h1>
          <p className="dash-subtitle">Admin workspace — MyNclex.</p>
          <span className="dash-role-badge">
            {isSuperAdmin ? 'Super Admin' : 'Admin'}
          </span>
        </div>

        <div className="dash-note">
          <strong>Coming next:</strong> user management, reported-question
          moderation, and platform configuration.
        </div>

        {isSuperAdmin && (
          <div className="dash-note">
            <strong>Super Admin extras:</strong> role assignment, tutor
            application review, and system health — appear here as those
            features land.
          </div>
        )}

        <RoleSwitcher currentRole={viewingAs} availableRoles={roles} />

        <div className="dash-signout-wrap">
          <form method="POST" action="/logout">
            <button type="submit" className="dash-signout">Sign out</button>
          </form>
        </div>
      </section>
    </main>
  );
}
