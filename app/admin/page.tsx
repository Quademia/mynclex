// mynclex/app/admin/page.tsx
//
// Admin section menu. Serves both ADMIN and SUPER_ADMIN roles.
//
// Model:
//   - /admin is a MENU. Each card links to a sub-route like /admin/payments,
//     /admin/bank, /admin/users — each gated by a specific permission.
//   - SUPER_ADMIN sees every card because `nclex_user_has_permission()`
//     short-circuits to true for SUPER_ADMIN on any permission check
//     (see db/rls.sql).
//   - ADMIN sees only the cards for permissions they've been granted
//     (hide-what-you-can't-access pattern).
//   - SUPER_ADMIN-only sections (role assignment, config) are implemented
//     as permissions that simply never get granted to plain admins — no
//     hard-coded super-admin checks in the page code.
//
// Today this is a placeholder: no real admin sections exist yet, so the
// menu is empty. Cards will appear here as real admin features land.

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
  // Drives the badge and the role-switcher label. Source of truth:
  // the `nclex_active_role` cookie set at /pick-role or via the switcher.
  // Falls back to the higher-priority role the user actually holds if
  // the cookie is missing or points somewhere else.
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

        {isSuperAdmin ? (
          <div className="dash-note">
            <strong>No admin sections defined yet.</strong> This menu will
            list every admin section — payments, question bank, tutor
            vetting, user management, and so on — as each feature lands.
            As Super Admin you&apos;ll see every section here.
          </div>
        ) : (
          <div className="dash-note">
            <strong>No admin sections granted yet.</strong> Sections
            appear here only when you&apos;re granted permission for them.
            Contact your super admin to request access.
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
