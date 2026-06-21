// mynclex/components/nav/student/programme-shell.tsx
//
// Slice 10.1 — server-component wrapper used by the student
// programme-detail layout. Mirrors the tutor-side programme-shell
// pattern (components/nav/tutor/programme-shell.tsx):
//   1. Gate STUDENT role + load the programme via
//      requireStudentProgrammeAccess (RLS filters out non-
//      PUBLISHED rows).
//   2. Swap ':programmeId' in the sidebar nav hrefs for the real
//      route param.
//   3. Render AppShell with the programme sidebar + ProductSwitcher
//      in the right slot (so the student can flip back to the Bank).
//
// Permissive access in v1 — any STUDENT can open any PUBLISHED
// programme. The enrolment slice tightens this in two places
// (RLS + the access helper) without touching this shell.

import { loadChromeData } from '@/lib/shell/load-chrome-data';
import { AppShell } from '@/components/shell/app-shell';
import { Footer } from '@/components/shell/footer';
import { SidebarFrame } from '@/components/nav/shared/sidebar-frame';
import { SidebarUserBar } from '@/components/nav/shared/sidebar-user-bar';
import { StudentSidebar } from './sidebar';
import { ProductSwitcher } from './product-switcher';
import { ProgrammeSwitcherTrigger } from './programme-switcher-trigger';
import { MobileNav } from '@/components/shell/mobile/mobile-nav';
import { STUDENT_PROGRAMME_DETAIL_NAV } from '@/lib/nav/student';
import { requireStudentProgrammeAccess } from '@/lib/access';

export async function StudentProgrammeShell({
  programmeId,
  children,
}: {
  programmeId: string;
  children: React.ReactNode;
}) {
  // Access gate first — STUDENT role + RLS-readable programme.
  // Throws 404 (notFound) if the programme isn't PUBLISHED or
  // doesn't exist.
  await requireStudentProgrammeAccess(programmeId);

  const chrome = await loadChromeData();

  const items = STUDENT_PROGRAMME_DETAIL_NAV.map((item) => ({
    ...item,
    href: item.href.replace(':programmeId', programmeId),
  }));

  return (
    <AppShell
      displayName={chrome.displayName}
      email={chrome.email}
      viewingAs={chrome.viewingAs}
      availableRoles={chrome.roles}
      productLabel="· Programme"
      rightSlot={<ProductSwitcher hasProgrammeEnrolment={true} />}
      mobileNav={
        <MobileNav
          displayName={chrome.displayName}
          email={chrome.email}
          viewingAs={chrome.viewingAs}
          availableRoles={chrome.roles}
          items={items}
          centerSlot={<ProductSwitcher hasProgrammeEnrolment={true} />}
          profileHref="/student/bank/profile"
        />
      }
    >
      <div className="product-layout">
        <SidebarFrame
          ariaLabel="Programme navigation"
          header={
            <ProgrammeSwitcherTrigger
              className="sidebar-switcher-btn"
              ariaLabel="Switch to another programme"
            >
              <span className="sidebar-switcher-label">Switch programme</span>
              <span className="sidebar-switcher-chev" aria-hidden="true">
                ⇄
              </span>
            </ProgrammeSwitcherTrigger>
          }
          userBar={
            <SidebarUserBar
              displayName={chrome.displayName}
              email={chrome.email}
            />
          }
        >
          <StudentSidebar items={items} />
        </SidebarFrame>
        <main className="product-content">
          {children}
          <Footer />
        </main>
      </div>
    </AppShell>
  );
}
