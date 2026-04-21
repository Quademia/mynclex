// mynclex/app/no-access/page.tsx

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import '../tokens.css';
import '../dashboards.css';

export const dynamic = 'force-dynamic';

export default async function NoAccessPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <main className="dash-main">
      <section className="dash-card">
        <div className="dash-header">
          <h1 className="dash-title">Account not ready</h1>
          <p className="dash-subtitle">
            Your account has no roles assigned yet.
          </p>
        </div>

        <div className="dash-note">
          <strong>What to do:</strong> contact support at
          support@qacademynurses.com with your email address
          ({user.email}) and we&apos;ll sort this out.
        </div>

        <form method="POST" action="/logout" style={{ marginTop: '20px' }}>
          <button type="submit" className="dash-signout">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
