// mynclex/components/nav/tutor/programme-sidebar.tsx
//
// Programme-scoped tutor sidebar. Flat list, no collapsibles. Driven
// by TUTOR_PROGRAMME_NAV after the parent layout has substituted
// :programmeId in each href with the actual route param.
//
// Mirrors the student sidebar's active-matching rule (startsWith) so
// deep routes like /tutor/programmes/[id]/weeks/[week_id] still
// highlight "Weeks".

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/lib/nav/types';
import { NavIcon } from '@/components/nav/shared/nav-icon';

export function TutorProgrammeSidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar" aria-label="Programme navigation">
      <div className="sidebar-header">This programme</div>
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
