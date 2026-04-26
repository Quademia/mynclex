// mynclex/app/(app)/admin/permissions/page.tsx
//
// Admin Permissions — placeholder. Gated on the SUPER_ADMIN role
// (NOT a permission bucket — only super-admins can grant other
// admins their buckets, and the page used to do it isn't a
// permission to itself).

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminPermissionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rolesData } = await supabase
    .from('nclex_user_roles')
    .select('role')
    .eq('user_id', user.id);
  const roles = (rolesData ?? []).map((r) => r.role as string);
  const isSuperAdmin = roles.includes('SUPER_ADMIN');
  if (!isSuperAdmin) redirect('/admin/dashboard');

  return (
    <Placeholder
      title="Admin Permissions"
      subtitle="Super_admin only"
      description="Create admin accounts, grant permission buckets, revoke. Coming soon — this page will let super admins manage what other admins can see and do."
    />
  );
}
