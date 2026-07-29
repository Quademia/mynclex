// mynclex/components/nav/student/sidebar.tsx
//
// Generic student sidebar driven by a NavItem[]. Each layout
// (bank, programme) passes its own array. Active row uses startsWith
// rather than exact match so deep routes like /student/bank/practice/[id]
// still highlight "Question Bank".
//
// Client Component because usePathname is a hook.

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/lib/nav/types';
import { NavIcon } from '@/components/nav/shared/nav-icon';

export function StudentSidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <aside className="sidebar" aria-label="Section navigation">
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
