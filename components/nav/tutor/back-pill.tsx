// mynclex/components/nav/tutor/back-pill.tsx
//
// Topbar context pill rendered only inside a programme. Clicking
// returns to /tutor/programmes (the global home). The programme
// title appears as a non-interactive suffix.
//
// Server Component — no hooks. NavIcon is also a Server Component
// since the slice 2.6 move; no 'use client' needed here.

import Link from 'next/link';
import { NavIcon } from '@/components/nav/shared/nav-icon';

export function TutorBackPill({ programmeTitle }: { programmeTitle: string }) {
  return (
    <div className="back-pill-wrap">
      <Link href="/tutor/programmes" className="back-pill" aria-label="Back to programmes">
        <NavIcon name="arrow-left" />
        <span>Programmes</span>
      </Link>
      <span className="ctx-sep" aria-hidden="true">
        ·
      </span>
      <span className="ctx-title">{programmeTitle}</span>
    </div>
  );
}
