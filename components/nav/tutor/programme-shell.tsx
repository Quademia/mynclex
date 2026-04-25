// mynclex/components/nav/tutor/programme-shell.tsx
//
// Server Component wrapper used by the [programme_id] layout.
// Resolves the :programmeId placeholder in TUTOR_PROGRAMME_NAV's
// hrefs to the actual route param, fetches the programme title
// (hardcoded demo lookup today), and renders the AppShell with the
// programme sidebar + back pill in the topbar's right slot.
//
// Replace DEMO_PROGRAMME_TITLES with a DB query once the
// nclex_programmes table lands. Add an ownership check at the same
// time so a tutor can't peek at another tutor's programme by
// guessing the id.

import { notFound } from 'next/navigation';
import { loadChromeData } from '@/lib/shell/load-chrome-data';
import { AppShell } from '@/components/shell/app-shell';
import { TutorProgrammeSidebar } from './programme-sidebar';
import { TutorBackPill } from './back-pill';
import { TUTOR_PROGRAMME_NAV } from '@/lib/nav/tutor';

const DEMO_PROGRAMME_TITLES: Record<string, string> = {
  'demo-bootcamp': '8-Week NCLEX Bootcamp',
  'demo-rolling': 'Self-paced Foundations',
};

export async function TutorProgrammeShell({
  programmeId,
  children,
}: {
  programmeId: string;
  children: React.ReactNode;
}) {
  const chrome = await loadChromeData();

  const programmeTitle = DEMO_PROGRAMME_TITLES[programmeId];
  // Unknown programme id with no DB to consult yet — 404 instead of
  // rendering a "Programme" placeholder that pretends the route is real.
  if (!programmeTitle) notFound();

  const items = TUTOR_PROGRAMME_NAV.map((item) => ({
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
        <TutorProgrammeSidebar items={items} />
        <main className="product-content">{children}</main>
      </div>
    </AppShell>
  );
}
