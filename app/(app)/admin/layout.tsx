// mynclex/app/(app)/admin/layout.tsx
//
// ADMIN/SUPER_ADMIN role gate for the entire /admin tree. Renders no
// chrome — each admin sub-folder owns its own chrome via <AdminShell>
// (which loads chrome data, filters the sidebar by permissions, and
// wraps in <AppShell> with productLabel="· Admin"). This mirrors the
// tutor pattern from slice 2.7.
//
// History: slice 2.6 had this layout render <AppShell> directly; slice
// 2.8 (admin nav scaffold) reverts that so each context can own its
// chrome without double-rendering.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: rolesData } = await supabase
    .from('nclex_user_roles')
    .select('role')
    .eq('user_id', user.id);
  const roles = (rolesData ?? []).map((r) => r.role as string);
  const isAdmin = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
  if (!isAdmin) redirect('/no-access');

  return <>{children}</>;
}
