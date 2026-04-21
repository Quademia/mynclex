// mynclex/app/(app)/admin/page.tsx
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
//
// Topbar + footer live in the (app) shell layout.

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Section cards are declared here. A card is shown if the user has the
// listed permission OR is SUPER_ADMIN. Add new cards as admin features land.
type SectionCard = {
  key: string;
  label: string;
  desc: string;
  href: string;
  permission: string;
};

const SECTIONS: SectionCard[] = [
  {
    key: 'bank',
    label: 'Question Bank',
    desc: 'Browse, author, and manage NCLEX-RN questions.',
    href: '/admin/bank',
    permission: 'BANK_CURATE',
  },
];

export default async function AdminDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [profileRes, rolesRes, permsRes] = await Promise.all([
    supabase
      .from('nclex_users')
      .select('forename, surname')
      .eq('id', user.id)
      .maybeSingle(),
    supabase.from('nclex_user_roles').select('role').eq('user_id', user.id),
    supabase
      .from('nclex_admin_permissions')
      .select('permission')
      .eq('user_id', user.id),
  ]);

  const profile = profileRes.data;
  const roles = (rolesRes.data ?? []).map((r) => r.role as string);
  const permissions = (permsRes.data ?? []).map((p) => p.permission as string);

  const holdsSuperAdmin = roles.includes('SUPER_ADMIN');
  const holdsAdmin = roles.includes('ADMIN');

  if (!holdsAdmin && !holdsSuperAdmin) {
    redirect('/no-access');
  }

  // Which admin-level view: drives the empty-state copy. Source of truth:
  // the `nclex_active_role` cookie. Falls back to the higher-priority
  // role the user actually holds.
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

  // Visible section cards: SUPER_ADMIN sees all; ADMIN sees only granted ones.
  const visibleSections = SECTIONS.filter(
    (s) => holdsSuperAdmin || permissions.includes(s.permission),
  );

  return (
    <main className="dash-main">
      <section className="dash-card">
        <div className="dash-header">
          <h1 className="dash-title">Welcome, {displayName}</h1>
          <p className="dash-subtitle">Admin workspace — MyNclex.</p>
        </div>

        {visibleSections.length > 0 ? (
          <div className="section-grid">
            {visibleSections.map((s) => (
              <Link key={s.key} href={s.href} className="section-card">
                <div className="section-card-label">{s.label}</div>
                <div className="section-card-desc">{s.desc}</div>
              </Link>
            ))}
          </div>
        ) : isSuperAdmin ? (
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
      </section>
    </main>
  );
}
