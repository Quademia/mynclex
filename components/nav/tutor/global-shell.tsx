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
import { Footer } from '@/components/shell/footer';
import { SidebarFrame } from '@/components/nav/shared/sidebar-frame';
import { SidebarUserBar } from '@/components/nav/shared/sidebar-user-bar';
import { TutorGlobalSidebar } from './global-sidebar';
import { MobileNav } from '@/components/shell/mobile/mobile-nav';
import { TUTOR_GLOBAL_NAV } from '@/lib/nav/tutor';
import { getNewEnquiryCountForTutor } from '@/lib/enquiries/queries';

export async function TutorGlobalShell({
  children,
}: {
  children: React.ReactNode;
}) {
  // Chrome + the "new enquiries" nav badge in one parallel pass. The count
  // is RLS-scoped to the tutor's own programmes (keyed to the 'enquiries'
  // NavItem); 0 → no pill.
  const [chrome, newEnquiries] = await Promise.all([
    loadChromeData(),
    getNewEnquiryCountForTutor(),
  ]);
  const navBadges = newEnquiries > 0 ? { enquiries: newEnquiries } : undefined;

  return (
    <AppShell
      displayName={chrome.displayName}
      email={chrome.email}
      viewingAs={chrome.viewingAs}
      availableRoles={chrome.roles}
      productLabel="· Tutor"
      mobileNav={
        <MobileNav
          displayName={chrome.displayName}
          email={chrome.email}
          viewingAs={chrome.viewingAs}
          availableRoles={chrome.roles}
          items={TUTOR_GLOBAL_NAV}
          profileHref="/tutor/profile"
          badges={navBadges}
        />
      }
    >
      <div className="product-layout">
        <SidebarFrame
          ariaLabel="Tutor navigation"
          userBar={
            <SidebarUserBar
              displayName={chrome.displayName}
              email={chrome.email}
            />
          }
        >
          <TutorGlobalSidebar items={TUTOR_GLOBAL_NAV} badges={navBadges} />
        </SidebarFrame>
        <main className="product-content">
          {children}
          <Footer />
        </main>
      </div>
    </AppShell>
  );
}
