// mynclex/app/pick-role/page.tsx
//
// Shown to users who hold MORE THAN ONE role after login, when they
// haven't yet picked an active role (or their previous choice no longer
// applies). Single-role users are bounced straight to /router.

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { switchRoleAction } from './actions';
import '../landing.css';
import '../dashboards.css';

export const dynamic = 'force-dynamic';

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'TUTOR' | 'STUDENT';

const LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  TUTOR: 'Tutor',
  STUDENT: 'Student',
};

const DESCRIPTIONS: Record<Role, string> = {
  SUPER_ADMIN: 'Full platform access — users, content, roles, config.',
  ADMIN: 'User management and content moderation.',
  TUTOR: 'Your classes, curriculum, and students.',
  STUDENT: 'NCLEX-RN question bank, programmes, and your progress.',
};

// Display order when presenting choices.
const ROLE_ORDER: Role[] = ['SUPER_ADMIN', 'ADMIN', 'TUTOR', 'STUDENT'];

export default async function PickRolePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: roleRows } = await supabase
    .from('nclex_user_roles')
    .select('role')
    .eq('user_id', user.id);

  const roles = (roleRows ?? []).map((r) => r.role as Role);

  if (roles.length === 0) {
    redirect('/no-access');
  }

  // Single-role users never see this page — /router handles them.
  if (roles.length === 1) {
    redirect('/router');
  }

  const ordered = ROLE_ORDER.filter((r) => roles.includes(r));

  return (
    <main className="dash-main">
      <section className="dash-card">
        <div className="dash-header">
          <h1 className="dash-title">Choose your workspace</h1>
          <p className="dash-subtitle">
            You have access to more than one workspace. Pick one to continue —
            you can switch anytime from inside.
          </p>
        </div>

        <div className="pick-role-list">
          {ordered.map((role) => (
            <form key={role} action={switchRoleAction} className="pick-role-form">
              <input type="hidden" name="role" value={role} />
              <button type="submit" className="pick-role-item">
                <div className="pick-role-item-label">{LABELS[role]}</div>
                <div className="pick-role-item-desc">{DESCRIPTIONS[role]}</div>
              </button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}
