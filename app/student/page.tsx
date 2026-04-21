// mynclex/app/student/page.tsx
//
// Student dashboard. Server-side role check: user must hold the STUDENT
// role or they're bounced to /no-access.

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { RoleSwitcher, type Role } from '@/components/role-switcher';
import '../landing.css';
import '../dashboards.css';

export const dynamic = 'force-dynamic';

export default async function StudentDashboard() {
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

  if (!roles.includes('STUDENT')) {
    redirect('/no-access');
  }

  const displayName = profile
    ? `${profile.forename} ${profile.surname}`
    : user.email ?? 'there';

  return (
    <main className="dash-main">
      <section className="dash-card">
        <div className="dash-header">
          <h1 className="dash-title">Welcome, {displayName}</h1>
          <p className="dash-subtitle">Student workspace — MyNclex.</p>
          <span className="dash-role-badge">Student</span>
        </div>

        <div className="dash-note">
          <strong>Coming next:</strong> NCLEX-RN question bank, readiness
          packs, programmes you&apos;re enrolled in, and your progress
          journey.
        </div>

        <RoleSwitcher currentRole="STUDENT" availableRoles={roles} />

        <div className="dash-signout-wrap">
          <form method="POST" action="/logout">
            <button type="submit" className="dash-signout">Sign out</button>
          </form>
        </div>
      </section>
    </main>
  );
}
