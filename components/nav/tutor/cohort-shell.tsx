// mynclex/components/nav/tutor/cohort-shell.tsx
//
// Server Component wrapper used by the [cohort_id] layout.
// Resolves the :cohortId placeholder in TUTOR_COHORT_NAV's hrefs
// to the actual route param, fetches the cohort + parent programme
// (RLS scopes to the tutor's own rows), and renders AppShell with
// the cohort sidebar + back-pill to the parent programme's
// Cohorts tab.
//
// Sibling world of <TutorProgrammeShell> — both render their own
// AppShell so the global tutor topbar/footer don't double-render.

import { notFound } from 'next/navigation';
import { loadChromeData } from '@/lib/shell/load-chrome-data';
import { AppShell } from '@/components/shell/app-shell';
import { Footer } from '@/components/shell/footer';
import { SidebarFrame } from '@/components/nav/shared/sidebar-frame';
import { SidebarUserBar } from '@/components/nav/shared/sidebar-user-bar';
import { TutorCohortSidebar } from './cohort-sidebar';
import { TutorCohortBackPill } from './cohort-back-pill';
import { TUTOR_COHORT_NAV } from '@/lib/nav/tutor';
import { getCohortForShell } from '@/lib/cohorts/queries';
import { formatCohortName } from '@/lib/cohorts/format';

export async function TutorCohortShell({
  cohortId,
  children,
}: {
  cohortId: string;
  children: React.ReactNode;
}) {
  const chrome = await loadChromeData();

  const ctx = await getCohortForShell(cohortId);
  // Unknown cohort id, or one this tutor doesn't own → 404.
  if (!ctx) notFound();
  // SELF_PACED programmes have no cohort layer — direct nav to a
  // cohort URL on a self-paced programme also 404s. (Shouldn't be
  // reachable normally since the Cohorts tab itself hides for
  // self-paced, but a stale link would land here otherwise.)
  if (ctx.programme.delivery_mode === 'SELF_PACED') notFound();

  const cohortLabel = formatCohortName(ctx.cohort);

  const items = TUTOR_COHORT_NAV.map((item) => ({
    ...item,
    href: item.href.replace(':cohortId', cohortId),
  }));

  return (
    <AppShell
      displayName={chrome.displayName}
      email={chrome.email}
      viewingAs={chrome.viewingAs}
      availableRoles={chrome.roles}
      productLabel="· Tutor"
      rightSlot={
        <TutorCohortBackPill
          programmeId={ctx.programme.programme_id}
          programmeTitle={ctx.programme.title}
        />
      }
    >
      <div className="product-layout">
        <SidebarFrame
          ariaLabel="Cohort navigation"
          userBar={
            <SidebarUserBar
              displayName={chrome.displayName}
              email={chrome.email}
            />
          }
        >
          <TutorCohortSidebar items={items} cohortLabel={cohortLabel} />
        </SidebarFrame>
        <main className="product-content">
          {children}
          <Footer />
        </main>
      </div>
    </AppShell>
  );
}
