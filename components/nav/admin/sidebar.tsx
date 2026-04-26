// mynclex/components/nav/admin/sidebar.tsx
//
// Admin sidebar. Receives a pre-filtered NavItem[] (filtering happens
// in <AdminShell> against the user's permissions) plus the total
// nav size for the "Visible items" footer counter.
//
// Bank renders as a collapsible parent — same pattern as tutor's
// global sidebar. Sub-items match the active state via pathname
// prefix. Hooks live in dedicated sub-components so React's
// rules-of-hooks isn't tripped by the flat-vs-parent branch.
//
// Mostly mirrors components/nav/tutor/global-sidebar.tsx — kept as a
// separate file per the audience-isolated pattern from slices 2.6 / 2.7.
// Generalisation can land later once we have 4+ usages of the same
// shape; today's two consumers (tutor + admin) are similar but not
// identical (admin needs the footer counter, tutor doesn't).

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { NavItem } from '@/lib/nav/types';
import { NavIcon } from '@/components/nav/shared/nav-icon';

export function AdminSidebar({
  items,
  totalCount,
}: {
  items: NavItem[];
  totalCount: number;
}) {
  const pathname = usePathname() ?? '';
  return (
    <aside className="sidebar" aria-label="Admin navigation">
      <div className="sidebar-content">
        {items.map((item) => (
          <SidebarRow key={item.key} item={item} pathname={pathname} />
        ))}
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-footer-label">Visible items</div>
        <div className="sidebar-footer-value">
          {items.length} of {totalCount}
        </div>
      </div>
    </aside>
  );
}

function SidebarRow({ item, pathname }: { item: NavItem; pathname: string }) {
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
