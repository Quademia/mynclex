// mynclex/app/(app)/student/programme/layout.tsx
//
// Wraps every /student/programme/* page with:
//   - the AppShell (topbar, footer, "· Programme" product label,
//     ProductSwitcher in the right slot)
//   - the programme sidebar (left)
//   - main content area (right)
//
// STUDENT role gate lives here — descendant pages trust it.
// Programme-only routes are not enrolment-gated yet (a programme
// student is the only one who reaches them via the picker /
// switcher); the enrolment guard lands with the real enrolment data.

import { redirect } from 'next/navigation';
import { loadChromeData } from '@/lib/shell/load-chrome-data';
import { AppShell } from '@/components/shell/app-shell';
import { StudentSidebar } from '@/components/nav/student/sidebar';
import { ProductSwitcher } from '@/components/nav/student/product-switcher';
import { STUDENT_PROGRAMME_NAV } from '@/lib/nav/student';

export const dynamic = 'force-dynamic';

export default async function ProgrammeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const chrome = await loadChromeData();
  if (!chrome.roles.includes('STUDENT')) redirect('/no-access');

  // Placeholder — replace with a real enrolment check.
  const hasProgrammeEnrolment = true;

  return (
    <AppShell
      displayName={chrome.displayName}
      email={chrome.email}
      viewingAs={chrome.viewingAs}
      availableRoles={chrome.roles}
      productLabel="· Programme"
      rightSlot={<ProductSwitcher hasProgrammeEnrolment={hasProgrammeEnrolment} />}
    >
      <div className="product-layout">
        <StudentSidebar items={STUDENT_PROGRAMME_NAV} />
        <main className="product-content">{children}</main>
      </div>
    </AppShell>
  );
}
