// mynclex/components/nav/tutor/drawer-header.tsx
//
// Mobile drawer header for the tutor PROGRAMME context — the way out of
// a context whose every nav row leads further in.
//
// On desktop the exit is <TutorBackPill>, passed as AppShell's `rightSlot`
// and rendered into `.shell-topbar`. That element is `display: none` on a
// phone, so the mobile drawer inherited the sidebar's items and not the
// pill: all seven rows pointed deeper into the same programme and nothing
// pointed back. The only in-app escape was the account sheet's Profile
// link, five taps away through a personal-settings page.
//
// This fills `MobileNav`'s `drawerHeader` slot, which was written for
// exactly this ("Programme/cohort pass name + Switch programme") and had
// never been passed by any caller. It also names the programme, which the
// default header (wordmark + role badge) does not — so a phone finally
// answers "which programme am I in?" as well as "how do I leave?".
//
// Server Component — no hooks, mirroring back-pill.tsx.

import Link from 'next/link';
import { NavIcon } from '@/components/nav/shared/nav-icon';

export function TutorDrawerHeader({ programmeTitle }: { programmeTitle: string }) {
  return (
    <div className="m-drawer-ctx">
      <Link
        href="/tutor/programmes"
        className="m-drawer-back"
        aria-label="Back to programmes"
      >
        <NavIcon name="arrow-left" />
        <span>Programmes</span>
      </Link>
      <span className="m-drawer-ctx-title">{programmeTitle}</span>
    </div>
  );
}
