// mynclex/components/nav/student/cohort-shell.tsx
//
// Slice 10.1 — server-component wrapper used by the student
// cohort-detail layout. Cohort is the tutor-led student's primary
// scope (versus the programme template, which is the self-paced
// student's scope). Sibling subtree to /student/programme/[id]/*
// (folder convention #7 — list and detail are siblings, plural
// for list, singular for detail).
//
// Mirrors components/nav/student/programme-shell.tsx but loads the
// cohort via requireStudentCohortAccess (RLS gates by parent-
// programme PUBLISHED status; the helper 404s on miss).

import { loadChromeData } from '@/lib/shell/load-chrome-data';
import { AppShell } from '@/components/shell/app-shell';
import { StudentSidebar } from './sidebar';
import { ProductSwitcher } from './product-switcher';
import { ProgrammeSwitcherTrigger } from './programme-switcher-trigger';
import { STUDENT_COHORT_DETAIL_NAV } from '@/lib/nav/student';
import { requireStudentCohortAccess } from '@/lib/access';

export async function StudentCohortShell({
  cohortId,
  children,
}: {
  cohortId: string;
  children: React.ReactNode;
}) {
  // Access gate first — STUDENT role + RLS-readable cohort + RLS-
  // readable parent programme (PUBLISHED).
  await requireStudentCohortAccess(cohortId);

  const chrome = await loadChromeData();

  const items = STUDENT_COHORT_DETAIL_NAV.map((item) => ({
    ...item,
    href: item.href.replace(':cohortId', cohortId),
  }));

  return (
    <AppShell
      displayName={chrome.displayName}
      email={chrome.email}
      viewingAs={chrome.viewingAs}
      availableRoles={chrome.roles}
      productLabel="· Programme"
      rightSlot={<ProductSwitcher hasProgrammeEnrolment={true} />}
    >
      <div className="product-layout">
        <div className="sidebar-column">
          <ProgrammeSwitcherTrigger
            className="sidebar-switcher-btn"
            ariaLabel="Switch to another programme"
          >
            <span className="sidebar-switcher-label">Switch programme</span>
            <span className="sidebar-switcher-chev" aria-hidden="true">
              ⇄
            </span>
          </ProgrammeSwitcherTrigger>
          <StudentSidebar items={items} />
        </div>
        <main className="product-content">{children}</main>
      </div>
    </AppShell>
  );
}
