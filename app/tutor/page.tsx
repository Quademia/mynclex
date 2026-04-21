// mynclex/app/tutor/page.tsx
//
// Tutor dashboard. Server-side role check: user must hold the TUTOR role
// or they're bounced to /no-access.

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { RoleSwitcher, type Role } from '@/components/role-switcher';
import '../landing.css';
import '../dashboards.css';

export const dynamic = 'force-dynamic';

export default async function TutorDashboard() {
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

  if (!roles.includes('TUTOR')) {
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
          <p className="dash-subtitle">Tutor workspace — MyNclex.</p>
          <span className="dash-role-badge">Tutor</span>
        </div>

        <div className="dash-note">
          <strong>Coming next:</strong> your programmes and cohorts,
          week-by-week curriculum editor, private bank items, student
          roster, and your public tutor profile.
        </div>

        <RoleSwitcher currentRole="TUTOR" availableRoles={roles} />

        <div className="dash-signout-wrap">
          <form method="POST" action="/logout">
            <button type="submit" className="dash-signout">Sign out</button>
          </form>
        </div>
      </section>
    </main>
  );
}
