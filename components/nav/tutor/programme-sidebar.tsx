// mynclex/components/nav/tutor/programme-sidebar.tsx
//
// Programme-scoped tutor sidebar. Flat list, no collapsibles. Driven
// by TUTOR_PROGRAMME_NAV after the parent layout has substituted
// :programmeId in each href with the actual route param.
//
// Header carries the programme's identity (name + delivery-mode chip)
// under the "This programme" eyebrow, mirroring the cohort sidebar's
// context line. Items with a `section` get a labelled divider above
// them — the mode-specific bottom group ("Delivery" → Cohorts).
//
// Mirrors the student sidebar's active-matching rule (startsWith) so
// deep routes like /tutor/programme/[id]/weeks/[week_id] still
// highlight "Weeks".

'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/lib/nav/types';
import { NavIcon } from '@/components/nav/shared/nav-icon';

export function TutorProgrammeSidebar({
  items,
  programmeTitle,
  modeLabel,
}: {
  items: NavItem[];
  programmeTitle: string;
  modeLabel: string;
}) {
  const pathname = usePathname();
  return (
    <aside className="sidebar" aria-label="Programme navigation">
      <div className="sidebar-header">This programme</div>
      <div className="sidebar-prog-name">{programmeTitle}</div>
      <div className="sidebar-mode-chip-row">
        <span className="sidebar-mode-chip">{modeLabel}</span>
      </div>
      {items.map((item, i) => {
        const showSection =
          item.section !== undefined && item.section !== items[i - 1]?.section;
        const isActive = pathname?.startsWith(item.href) ?? false;
        return (
          <Fragment key={item.key}>
            {showSection && (
              <div className="sidebar-section">
                <span className="sidebar-section-label">{item.section}</span>
              </div>
            )}
            <Link
              href={item.href}
              className={isActive ? 'nav-item active' : 'nav-item'}
              aria-current={isActive ? 'page' : undefined}
            >
              <NavIcon name={item.icon} />
              <span className="nav-label">{item.label}</span>
            </Link>
          </Fragment>
        );
      })}
    </aside>
  );
}
