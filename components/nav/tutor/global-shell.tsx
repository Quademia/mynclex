// mynclex/components/nav/tutor/global-shell.tsx
//
// Server Component wrapper used by every tutor global sub-folder
// layout (programmes, bank, students, payments, profile). Loads
// chrome data once per render and renders the AppShell with the
// "· Tutor" product label and the global sidebar.
//
// The TUTOR role check stays in (app)/tutor/layout.tsx so it runs
// once per request — this shell trusts the parent gate and just
// composes chrome.

import { loadChromeData } from '@/lib/shell/load-chrome-data';
import { AppShell } from '@/components/shell/app-shell';
import { TutorGlobalSidebar } from './global-sidebar';
import { TUTOR_GLOBAL_NAV } from '@/lib/nav/tutor';

export async function TutorGlobalShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const chrome = await loadChromeData();

  return (
    <AppShell
      displayName={chrome.displayName}
      email={chrome.email}
      viewingAs={chrome.viewingAs}
      availableRoles={chrome.roles}
      productLabel="· Tutor"
    >
      <div className="product-layout">
        <TutorGlobalSidebar items={TUTOR_GLOBAL_NAV} />
        <main className="product-content">{children}</main>
      </div>
    </AppShell>
  );
}
