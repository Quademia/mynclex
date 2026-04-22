// mynclex/app/(app)/tutor/layout.tsx
//
// Role gate for the entire /tutor tree. Added in Slice 2.1 when the
// tree gained a second page (/tutor/bank) so the TUTOR check lives
// once at the boundary rather than being duplicated per page.
//
// The (app) layout one level up already enforces authenticated access
// and renders the topbar + footer chrome. This layout just adds the
// TUTOR role requirement.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function TutorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The (app) layout already redirects unauthenticated users to /login,
  // so this branch is defensive — in practice we always have a user.
  if (!user) {
    redirect('/login');
  }

  const { data: rolesData } = await supabase
    .from('nclex_user_roles')
    .select('role')
    .eq('user_id', user.id);

  const roles = (rolesData ?? []).map((r) => r.role as string);

  if (!roles.includes('TUTOR')) {
    redirect('/no-access');
  }

  return <>{children}</>;
}
