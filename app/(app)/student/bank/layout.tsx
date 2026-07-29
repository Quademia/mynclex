// mynclex/app/(app)/student/bank/layout.tsx
//
// Wraps every /student/bank/* page with:
//   - the AppShell (topbar, footer, "· Bank" product label, ProductSwitcher
//     in the right slot)
//   - the bank sidebar (left)
//   - main content area (right)
//
// Front-door gate (relaxed 2026-07-09): requireBankOrReadiness admits a
// student with active bank access OR a readiness entitlement — so a
// pack-owner with no bank subscription can reach the Readiness Packs page
// (which lives in this sidebar). ENTRY only: the bank-consumption pages
// (dashboard / practice / cases / history / profile) each keep their own
// requireActiveBankSubscription() so a readiness-only student who clicks
// them still bounces to the reason-aware access wall (/no-access?need=bank).
// The Packs page adds no bank check. A student with neither entitlement
// bounces to the same wall here. The create-attempt RPC carries the bank
// check as the hard backstop.
//
// hasProgrammeEnrolment is hard-coded today; replace when the
// nclex_enrolments table lands.

import { requireBankOrReadiness } from '@/lib/access';
import { loadChromeData } from '@/lib/shell/load-chrome-data';
import { AppShell } from '@/components/shell/app-shell';
import { Footer } from '@/components/shell/footer';
import { SidebarFrame } from '@/components/nav/shared/sidebar-frame';
import { SidebarUserBar } from '@/components/nav/shared/sidebar-user-bar';
import { StudentSidebar } from '@/components/nav/student/sidebar';
import { ProductSwitcher } from '@/components/nav/student/product-switcher';
import { MobileNav } from '@/components/shell/mobile/mobile-nav';
import { STUDENT_BANK_NAV } from '@/lib/nav/student';

export const dynamic = 'force-dynamic';

export default async function BankLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireBankOrReadiness();
  const chrome = await loadChromeData();

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
      mobileNav={
        <MobileNav
          displayName={chrome.displayName}
          email={chrome.email}
          viewingAs={chrome.viewingAs}
          availableRoles={chrome.roles}
          items={STUDENT_BANK_NAV}
          centerSlot={<ProductSwitcher hasProgrammeEnrolment={hasProgrammeEnrolment} />}
          profileHref="/student/bank/profile"
        />
      }
    >
      <div className="product-layout">
        <SidebarFrame
          ariaLabel="Bank navigation"
          userBar={
            <SidebarUserBar
              displayName={chrome.displayName}
              email={chrome.email}
            />
          }
        >
          <StudentSidebar items={STUDENT_BANK_NAV} />
        </SidebarFrame>
        <main className="product-content">
          {children}
          <Footer />
        </main>
      </div>
    </AppShell>
  );
}
