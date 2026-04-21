// mynclex/app/(app)/student/page.tsx
//
// Student dashboard body. The topbar + footer live in the (app) shell
// layout — this page only renders its own content. Server-side role
// check: user must hold STUDENT or they're bounced to /no-access.

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

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
  const roles = (rolesRes.data ?? []).map((r) => r.role as string);

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
        </div>

        <div className="dash-note">
          <strong>Coming next:</strong> NCLEX-RN question bank, readiness
          packs, programmes you&apos;re enrolled in, and your progress
          journey.
        </div>
      </section>
    </main>
  );
}
