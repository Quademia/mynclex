// mynclex/app/(app)/tutor/layout.tsx
//
// Role gate + chrome for the entire /tutor tree. The (app) layout
// upstream only does the auth redirect now (each audience renders
// its own chrome since 2026-04-25 student nav scaffold) so this
// layout loads its chrome data and wraps children in <AppShell>.
//
// No productLabel or rightSlot today — the dedicated tutor nav
// scaffold slice will add them.

import { redirect } from 'next/navigation';
import { loadChromeData } from '@/lib/shell/load-chrome-data';
import { AppShell } from '@/components/shell/app-shell';

export const dynamic = 'force-dynamic';

export default async function TutorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const chrome = await loadChromeData();

  if (!chrome.roles.includes('TUTOR')) {
    redirect('/no-access');
  }

  return (
    <AppShell
      displayName={chrome.displayName}
      email={chrome.email}
      viewingAs={chrome.viewingAs}
      availableRoles={chrome.roles}
    >
      {children}
    </AppShell>
  );
}
