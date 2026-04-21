// mynclex/app/router/page.tsx

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const ROLE_PRIORITY = ['SUPER_ADMIN', 'ADMIN', 'TUTOR', 'STUDENT'] as const;

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

  const topRole = ROLE_PRIORITY.find((r) => roles.includes(r)) ?? null;
  if (!topRole) {
    redirect('/no-access');
  }

  redirect('/dashboard');
}
