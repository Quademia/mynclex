// mynclex/app/(app)/tutor/page.tsx
//
// Tutor dashboard body. Topbar + footer live in the (app) shell
// layout. The TUTOR role gate lives in (app)/tutor/layout.tsx; this
// page trusts that gate.

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type SectionCard = {
  key: string;
  label: string;
  desc: string;
  href: string;
};

const SECTIONS: SectionCard[] = [
  {
    key: 'bank',
    label: 'My Questions',
    desc: 'Browse, author, and manage your private question bank.',
    href: '/tutor/bank',
  },
];

export default async function TutorDashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('nclex_users')
    .select('forename, surname')
    .eq('id', user.id)
    .maybeSingle();

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

        <div className="section-grid">
          {SECTIONS.map((s) => (
            <Link key={s.key} href={s.href} className="section-card">
              <div className="section-card-label">{s.label}</div>
              <div className="section-card-desc">{s.desc}</div>
            </Link>
          ))}
        </div>

        <div className="dash-note">
          <strong>Coming next:</strong> your programmes and cohorts,
          week-by-week curriculum editor, student roster, and your
          public tutor profile.
        </div>
      </section>
    </main>
  );
}
