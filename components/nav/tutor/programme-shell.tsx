// mynclex/components/nav/tutor/programme-shell.tsx
//
// Server Component wrapper used by the [programme_id] layout.
// Resolves the :programmeId placeholder in TUTOR_PROGRAMME_NAV's
// hrefs to the actual route param, fetches the programme title
// from nclex_programmes (RLS scopes to the tutor's own rows), and
// renders the AppShell with the programme sidebar + back pill in
// the topbar's right slot.
//
// Slice 9.1a wired this up against the real DB. RLS = ownership
// check; the SELECT returns no row for programmes that aren't the
// tutor's, which becomes a 404 here.

import { notFound } from 'next/navigation';
import { loadChromeData } from '@/lib/shell/load-chrome-data';
import { AppShell } from '@/components/shell/app-shell';
import { Footer } from '@/components/shell/footer';
import { SidebarFrame } from '@/components/nav/shared/sidebar-frame';
import { SidebarUserBar } from '@/components/nav/shared/sidebar-user-bar';
import { TutorProgrammeSidebar } from './programme-sidebar';
import { TutorBackPill } from './back-pill';
import { TutorDrawerHeader } from './drawer-header';
import { MobileNav } from '@/components/shell/mobile/mobile-nav';
import { TUTOR_PROGRAMME_NAV } from '@/lib/nav/tutor';
import { getProgrammeForShell } from '@/lib/programmes/queries';

export async function TutorProgrammeShell({
  programmeId,
  children,
}: {
  programmeId: string;
  children: React.ReactNode;
}) {
  const chrome = await loadChromeData();

  const programme = await getProgrammeForShell(programmeId);
  // Unknown programme id, or one this tutor doesn't own → 404.
  if (!programme) notFound();
  const programmeTitle = programme.title;

  // SELF_PACED programmes have no cohort layer (main.md §Self-paced
  // surface), so the Cohorts sidebar entry hides for them — and Progress,
  // its self-paced counterpart, hides for tutor-led, where the same
  // dashboard lives on each cohort instead. Exactly one of the pair
  // survives, which is why the "Delivery" section never renders empty.
  // ⚠ Hiding a row is not access control: /progress 404s on a tutor-led
  // programme in its own right.
  // Enrolments shows for BOTH modes since the 2026-06-12 move to
  // programme level.
  const selfPaced = programme.delivery_mode === 'SELF_PACED';
  const items = TUTOR_PROGRAMME_NAV
    .filter((item) => !(item.key === 'cohorts' && selfPaced))
    .filter((item) => !(item.key === 'progress' && !selfPaced))
    .map((item) => ({
      ...item,
      href: item.href.replace(':programmeId', programmeId),
    }));

  return (
    <AppShell
      displayName={chrome.displayName}
      email={chrome.email}
      viewingAs={chrome.viewingAs}
      availableRoles={chrome.roles}
      productLabel="· Tutor"
      rightSlot={<TutorBackPill programmeTitle={programmeTitle} />}
      mobileNav={
        <MobileNav
          displayName={chrome.displayName}
          email={chrome.email}
          viewingAs={chrome.viewingAs}
          availableRoles={chrome.roles}
          items={items}
          profileHref="/tutor/profile"
          // Without this the drawer has no way back: `rightSlot` (the
          // desktop back-pill) lives in `.shell-topbar`, which a phone
          // hides, and every row in `items` points deeper into this
          // same programme.
          drawerHeader={<TutorDrawerHeader programmeTitle={programmeTitle} />}
        />
      }
    >
      <div className="product-layout">
        <SidebarFrame
          ariaLabel="Programme navigation"
          userBar={
            <SidebarUserBar
              displayName={chrome.displayName}
              email={chrome.email}
            />
          }
        >
          <TutorProgrammeSidebar
            items={items}
            programmeTitle={programmeTitle}
            modeLabel={selfPaced ? 'Self-paced' : 'Tutor-led'}
          />
        </SidebarFrame>
        <main className="product-content">
          {children}
          <Footer />
        </main>
      </div>
    </AppShell>
  );
}
