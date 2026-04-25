// mynclex/app/(app)/admin/layout.tsx
//
// Role gate + chrome for the entire /admin tree. Created 2026-04-25
// when (app)/layout.tsx stopped rendering shared chrome. ADMIN or
// SUPER_ADMIN can pass; everyone else is bounced to /no-access.
//
// No productLabel or rightSlot — the dedicated admin nav scaffold
// slice will add them.

import { redirect } from 'next/navigation';
import { loadChromeData } from '@/lib/shell/load-chrome-data';
import { AppShell } from '@/components/shell/app-shell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const chrome = await loadChromeData();

  const isAdmin =
    chrome.roles.includes('ADMIN') || chrome.roles.includes('SUPER_ADMIN');
  if (!isAdmin) redirect('/no-access');

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
