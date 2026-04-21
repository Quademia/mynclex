// mynclex/app/pick-role/actions.ts
//
// Server Action used by both /pick-role and the topbar role-chip.
// Sets the `nclex_active_role` cookie and redirects to the chosen
// role's dashboard.

'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const ROLE_TO_PATH: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  ADMIN: '/admin',
  TUTOR: '/tutor',
  STUDENT: '/student',
};

const VALID_ROLES = new Set(Object.keys(ROLE_TO_PATH));

export async function switchRoleAction(formData: FormData): Promise<void> {
  const role = String(formData.get('role') ?? '');

  if (!VALID_ROLES.has(role)) {
    redirect('/no-access');
  }

  // Server-side check: user must actually hold this role.
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
    .eq('user_id', user.id)
    .eq('role', role);

  if (error || !roleRows || roleRows.length === 0) {
    redirect('/no-access');
  }

  const cookieStore = await cookies();
  cookieStore.set('nclex_active_role', role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  redirect(ROLE_TO_PATH[role]);
}
