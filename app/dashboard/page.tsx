// mynclex/app/dashboard/page.tsx

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import './dashboard.css';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
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
      .select('forename, surname, email')
      .eq('id', user.id)
      .maybeSingle(),
    supabase.from('nclex_user_roles').select('role').eq('user_id', user.id),
  ]);

  const profile = profileRes.data;
  const roles = (rolesRes.data ?? []).map((r) => r.role as string);

  const displayName = profile
    ? `${profile.forename} ${profile.surname}`
    : user.email ?? 'there';

  return (
    <main className="dash-main">
      <section className="dash-card">
        <div className="dash-header">
          <h1 className="dash-title">Welcome, {displayName}</h1>
          <p className="dash-subtitle">MyNclex dashboard — Slice 1 placeholder.</p>
        </div>

        <div className="dash-info">
          <div className="dash-row">
            <span className="dash-label">Email</span>
            <span className="dash-value">{profile?.email ?? user.email}</span>
          </div>
          <div className="dash-row">
            <span className="dash-label">Role{roles.length > 1 ? 's' : ''}</span>
            <span className="dash-value">
              {roles.length > 0 ? roles.join(', ') : '—'}
            </span>
          </div>
          <div className="dash-row">
            <span className="dash-label">User ID</span>
            <span className="dash-value dash-mono">{user.id}</span>
          </div>
        </div>

        <form method="POST" action="/logout">
          <button type="submit" className="dash-signout">
            Sign out
          </button>
        </form>

        <div className="dash-note">
          <strong>Coming next:</strong> role-specific dashboards (student,
          tutor, admin), the bank, and tutored programmes.
        </div>
      </section>
    </main>
  );
}
