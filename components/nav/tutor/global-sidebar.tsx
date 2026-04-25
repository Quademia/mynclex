// mynclex/components/nav/tutor/global-sidebar.tsx
//
// Tutor global sidebar. Driven by NavItem[] from lib/nav/tutor.ts.
//
// Items with NavItem.children render as a collapsible parent:
//   - Click the parent row to toggle the dropdown open/close.
//   - Default expansion: open if any child's href is a prefix of the
//     current pathname — so deep-links land already-expanded.
//   - The parent itself never highlights as "active"; only the
//     matching sub-item does. The caret rotates to indicate state.
//
// Items without children render as plain Link rows (active when
// pathname.startsWith(item.href) — same rule as the student sidebar).
//
// Client component because expand/collapse uses local useState and
// active-state matching uses usePathname.

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { NavItem } from '@/lib/nav/types';
import { NavIcon } from '@/components/nav/shared/nav-icon';

export function TutorGlobalSidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? '';
  return (
    <aside className="sidebar" aria-label="Tutor navigation">
      {items.map((item) => (
        <SidebarRow key={item.key} item={item} pathname={pathname} />
      ))}
    </aside>
  );
}

function SidebarRow({ item, pathname }: { item: NavItem; pathname: string }) {
  // Split into two components below so React Hook order stays stable
  // — flat rows have no hooks; parent rows always call useMemo + useState.
  if (item.children?.length) {
    return <ParentRow item={item} pathname={pathname} />;
  }
  return <FlatRow item={item} pathname={pathname} />;
}

function FlatRow({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      className={isActive ? 'nav-item active' : 'nav-item'}
      aria-current={isActive ? 'page' : undefined}
    >
      <NavIcon name={item.icon} />
      <span className="nav-label">{item.label}</span>
    </Link>
  );
}

function ParentRow({ item, pathname }: { item: NavItem; pathname: string }) {
  const children = item.children!;
  const startsExpanded = useMemo(
    () => children.some((c) => pathname.startsWith(c.href)),
    [children, pathname],
  );
  const [open, setOpen] = useState(startsExpanded);

  return (
    <>
      <button
        type="button"
        className={open ? 'nav-item nav-item-parent open' : 'nav-item nav-item-parent'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <NavIcon name={item.icon} />
        <span className="nav-label">{item.label}</span>
        <span className="caret">
          <NavIcon name="chevron-down" />
        </span>
      </button>
      {open && (
        <div className="nav-sub-list" role="group" aria-label={item.label}>
          {children.map((sub) => {
            const isActive = pathname.startsWith(sub.href);
            return (
              <Link
                key={sub.key}
                href={sub.href}
                className={isActive ? 'nav-sub active' : 'nav-sub'}
                aria-current={isActive ? 'page' : undefined}
              >
                {sub.label}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
