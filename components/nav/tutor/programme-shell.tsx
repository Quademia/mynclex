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
  // surface), so the Cohorts sidebar entry hides for them. Conversely,
  // Enrolments only shows for SELF_PACED — tutor-led enrolments are
  // managed per cohort. Other tutor-led-only items (Live Sessions etc.)
  // keep showing for now; their cohort-layer migration lands with
  // later slices.
  const selfPaced = programme.delivery_mode === 'SELF_PACED';
  const items = TUTOR_PROGRAMME_NAV
    .filter((item) => !(item.key === 'cohorts' && selfPaced))
    .filter((item) => !(item.key === 'enrolments' && !selfPaced))
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
          <TutorProgrammeSidebar items={items} />
        </SidebarFrame>
        <main className="product-content">
          {children}
          <Footer />
        </main>
      </div>
    </AppShell>
  );
}
