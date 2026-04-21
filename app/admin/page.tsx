// mynclex/app/admin/page.tsx
//
// Admin dashboard — serves both ADMIN and SUPER_ADMIN roles.
// SUPER_ADMIN users see an extra "super-admin" section via a simple
// conditional render. Per-permission gates (via nclex_user_has_permission)
// will land as real admin tasks surface.

import { createClient } from '@/lib/supabase/server';
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

  const isSuperAdmin = roles.includes('SUPER_ADMIN');
  const isAdmin = roles.includes('ADMIN') || isSuperAdmin;

  if (!isAdmin) {
    redirect('/no-access');
  }

  const displayName = profile
    ? `${profile.forename} ${profile.surname}`
    : user.email ?? 'there';

  // SUPER_ADMIN takes precedence when both ADMIN and SUPER_ADMIN are held.
  const currentRole: Role = isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN';

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

        <RoleSwitcher currentRole={currentRole} availableRoles={roles} />

        <div className="dash-signout-wrap">
          <form method="POST" action="/logout">
            <button type="submit" className="dash-signout">Sign out</button>
          </form>
        </div>
      </section>
    </main>
  );
}
