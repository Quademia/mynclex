// mynclex/app/(app)/tutor/layout.tsx
//
// TUTOR role gate for the entire /tutor tree. Renders no chrome —
// each tutor sub-folder owns its own chrome via <TutorGlobalShell>
// (programmes, bank, students, payments, profile) or
// <TutorProgrammeShell> (programme/[programme_id]/...). This shape
// lets the programme context replace the global sidebar with the
// programme sidebar without double-rendering the topbar/footer.
//
// History: slice 2.6 briefly had this layout render <AppShell>; the
// tutor nav scaffold (slice 2.7) reverted that so each context can
// own its chrome.

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
  if (!user) redirect('/login');

  const { data: rolesData } = await supabase
    .from('nclex_user_roles')
    .select('role')
    .eq('user_id', user.id);
  const roles = (rolesData ?? []).map((r) => r.role as string);
  if (!roles.includes('TUTOR')) redirect('/no-access');

  return <>{children}</>;
}
