// mynclex/app/(app)/tutor/page.tsx
//
// Tutor dashboard body. Topbar + footer live in the (app) shell
// layout. Server-side role check: user must hold TUTOR.

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

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
  const roles = (rolesRes.data ?? []).map((r) => r.role as string);

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
        </div>

        <div className="dash-note">
          <strong>Coming next:</strong> your programmes and cohorts,
          week-by-week curriculum editor, private bank items, student
          roster, and your public tutor profile.
        </div>
      </section>
    </main>
  );
}
