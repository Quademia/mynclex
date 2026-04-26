// mynclex/app/(app)/admin/users/page.tsx
//
// Users — placeholder. Gated on USERS_MANAGE.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [rolesRes, permsRes] = await Promise.all([
    supabase.from('nclex_user_roles').select('role').eq('user_id', user.id),
    supabase.from('nclex_admin_permissions').select('permission').eq('user_id', user.id),
  ]);
  const roles = (rolesRes.data ?? []).map((r) => r.role as string);
  const perms = (permsRes.data ?? []).map((p) => p.permission as string);
  const allowed = roles.includes('SUPER_ADMIN') || perms.includes('USERS_MANAGE');
  if (!allowed) redirect('/admin/dashboard');

  return (
    <Placeholder
      title="Users"
      subtitle="All student, tutor, admin accounts"
      description="Search, filter by role, suspend, grant, delete."
    />
  );
}
