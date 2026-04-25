// mynclex/app/router/page.tsx
//
// Post-login traffic controller.
//
// Dispatch rules:
//   - 0 roles            → /no-access
//   - exactly 1 role     → that role's dashboard (SUPER_ADMIN & ADMIN → /admin)
//   - 2+ roles:
//       * valid `nclex_active_role` cookie → that role's dashboard
//       * otherwise                        → /pick-role

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

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

  if (roles.length === 0) {
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
