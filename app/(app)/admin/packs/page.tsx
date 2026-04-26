// mynclex/app/(app)/admin/packs/page.tsx
//
// Readiness Packs — placeholder. Gated on BANK_CURATE.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Placeholder } from '@/components/nav/shared/placeholder';

export const dynamic = 'force-dynamic';

export default async function AdminPacksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [rolesRes, permsRes] = await Promise.all([
    supabase.from('nclex_user_roles').select('role').eq('user_id', user.id),
    supabase.from('nclex_admin_permissions').select('permission').eq('user_id', user.id),
  ]);
  const roles = (rolesRes.data ?? []).map((r) => r.role as string);
  const perms = (permsRes.data ?? []).map((p) => p.permission as string);
  const allowed = roles.includes('SUPER_ADMIN') || perms.includes('BANK_CURATE');
  if (!allowed) redirect('/admin/dashboard');

  return (
    <Placeholder
      title="Readiness Packs"
      subtitle="Curated assessment sets"
      description="Create and publish readiness packs with reserved questions."
    />
  );
}
