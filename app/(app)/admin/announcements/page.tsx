// mynclex/app/(app)/admin/announcements/page.tsx
//
// Announcements — placeholder. Gated on COMMS_MANAGE.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminAnnouncementsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [rolesRes, permsRes] = await Promise.all([
    supabase.from('nclex_user_roles').select('role').eq('user_id', user.id),
    supabase.from('nclex_admin_permissions').select('permission').eq('user_id', user.id),
  ]);
  const roles = (rolesRes.data ?? []).map((r) => r.role as string);
  const perms = (permsRes.data ?? []).map((p) => p.permission as string);
  const allowed = roles.includes('SUPER_ADMIN') || perms.includes('COMMS_MANAGE');
  if (!allowed) redirect('/admin/dashboard');

  return (
    <Placeholder
      title="Announcements"
      subtitle="Platform-wide messaging"
      description="Target by audience, schedule, publish."
    />
  );
}
