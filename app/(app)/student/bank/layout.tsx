// mynclex/app/(app)/student/bank/layout.tsx
//
// Wraps every /student/bank/* page with:
//   - the AppShell (topbar, footer, "· Bank" product label, ProductSwitcher
//     in the right slot)
//   - the bank sidebar (left)
//   - main content area (right)
//
// STUDENT role gate lives here — descendant pages trust it.
//
// hasProgrammeEnrolment is hard-coded today; replace when the
// nclex_enrolments table lands.

import { redirect } from 'next/navigation';
import { loadChromeData } from '@/lib/shell/load-chrome-data';
import { AppShell } from '@/components/shell/app-shell';
import { StudentSidebar } from '@/components/nav/student/sidebar';
import { ProductSwitcher } from '@/components/nav/student/product-switcher';
import { STUDENT_BANK_NAV } from '@/lib/nav/student';

export const dynamic = 'force-dynamic';

export default async function BankLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const chrome = await loadChromeData();
  if (!chrome.roles.includes('STUDENT')) redirect('/no-access');

  // Placeholder — replace with a real enrolment check. Slice 10.1
  // flips this to true so the topbar Programme pill opens the
  // <ProgrammeSwitcherOverlay> for permissive v1 testing. When the
  // enrolment slice ships, this becomes a real lookup; students
  // without an enrolment will see the upsell modal again.
  const hasProgrammeEnrolment = true;

  return (
    <AppShell
      displayName={chrome.displayName}
      email={chrome.email}
      viewingAs={chrome.viewingAs}
      availableRoles={chrome.roles}
      productLabel="· Bank"
      rightSlot={<ProductSwitcher hasProgrammeEnrolment={hasProgrammeEnrolment} />}
    >
      <div className="product-layout">
        <StudentSidebar items={STUDENT_BANK_NAV} />
        <main className="product-content">{children}</main>
      </div>
    </AppShell>
  );
}
