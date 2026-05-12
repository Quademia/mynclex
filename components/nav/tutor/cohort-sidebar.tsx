// mynclex/components/nav/tutor/cohort-sidebar.tsx
//
// Cohort-scoped tutor sidebar. Flat list, no collapsibles. Driven
// by TUTOR_COHORT_NAV after the parent layout has substituted
// :cohortId in each href with the actual route param.
//
// Mirrors the programme sidebar's active-matching rule (startsWith)
// for routing consistency.

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/lib/nav/types';
import { NavIcon } from '@/components/nav/shared/nav-icon';

export function TutorCohortSidebar({
  items,
  cohortLabel,
}: {
  items: NavItem[];
  cohortLabel: string;
}) {
  const pathname = usePathname();
  return (
    <aside className="sidebar" aria-label="Cohort navigation">
      <div className="sidebar-header">This cohort</div>
      <div className="sidebar-context">{cohortLabel}</div>
      {items.map((item) => {
        const isActive = pathname?.startsWith(item.href) ?? false;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={isActive ? 'nav-item active' : 'nav-item'}
            aria-current={isActive ? 'page' : undefined}
          >
            <NavIcon name={item.icon} />
            <span className="nav-label">{item.label}</span>
          </Link>
        );
      })}
    </aside>
  );
}
