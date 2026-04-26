// mynclex/app/(app)/admin/tutors/page.tsx
//
// Tutors — placeholder. Gated on TUTORS_MANAGE.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminTutorsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [rolesRes, permsRes] = await Promise.all([
    supabase.from('nclex_user_roles').select('role').eq('user_id', user.id),
    supabase.from('nclex_admin_permissions').select('permission').eq('user_id', user.id),
  ]);
  const roles = (rolesRes.data ?? []).map((r) => r.role as string);
  const perms = (permsRes.data ?? []).map((p) => p.permission as string);
  const allowed = roles.includes('SUPER_ADMIN') || perms.includes('TUTORS_MANAGE');
  if (!allowed) redirect('/admin/dashboard');

  return (
    <Placeholder
      title="Tutors"
      subtitle="Active tutor accounts"
      description="Approved tutor roster. Deactivate, edit profile, view their programmes."
    />
  );
}
