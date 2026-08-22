// mynclex/app/router/page.tsx
//
// Post-login traffic controller.
//
// Dispatch rules:
//   - 0 roles + a tutor application → the application page  (§8-A)
//   - 0 roles, nothing else         → /no-access
//   - exactly 1 role     → that role's dashboard (SUPER_ADMIN & ADMIN → /admin)
//   - 2+ roles:
//       * valid `nclex_active_role` cookie → that role's dashboard
//       * otherwise                        → /pick-role

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { loadMyTutorRecord } from '@/lib/tutors/queries';
import { TUTOR_APPLICATION_PATH } from '@/lib/tutors/types';

export const dynamic = 'force-dynamic';

const ROLE_TO_PATH: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  ADMIN: '/admin',
  TUTOR: '/tutor',
  STUDENT: '/student/picker',
};

export default async function RouterPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: roleRows, error } = await supabase
    .from('nclex_user_roles')
    .select('role')
    .eq('user_id', user.id);

  if (error) {
    console.error('Role fetch failed:', error.message);
    redirect('/no-access');
  }

  const roles = (roleRows ?? []).map((r) => r.role as string);

  // ⭐ THE SPLIT (tutor-onboarding 2c, §8-A). "No roles" used to mean one
  // thing; since the self-serve doorway it means two.
  //
  // A person who applied to teach and has not been approved holds NO
  // ROLE AT ALL — that is deliberate (§4: applying never grants one, and
  // auto-creating a STUDENT role to give them somewhere to stand was
  // considered and rejected, because it grants what they did not ask for
  // and leaves a rejected applicant silently a student forever).
  //
  // ⚠ So without this branch, every self-serve applicant lands on
  // /no-access on every sign-in — a page that tells the person we are
  // actively deciding about that they do not belong here. Their own
  // status page exists; this is what points at it.
  if (roles.length === 0) {
    const application = await loadMyTutorRecord();
    if (application) {
      redirect(TUTOR_APPLICATION_PATH);
    }
    redirect('/no-access');
  }

  if (roles.length === 1) {
    const path = ROLE_TO_PATH[roles[0]];
    if (!path) {
      redirect('/no-access');
    }
    redirect(path);
  }

  // Multi-role — honour the active-role cookie if it's valid for this user.
  const cookieStore = await cookies();
  const activeRole = cookieStore.get('nclex_active_role')?.value;

  if (activeRole && roles.includes(activeRole)) {
    const path = ROLE_TO_PATH[activeRole];
    if (path) {
      redirect(path);
    }
  }

  redirect('/pick-role');
}
