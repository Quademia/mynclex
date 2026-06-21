'use client';

// mynclex/components/shell/mobile/bottom-tabs.tsx
//
// Mobile bottom-tab bar (≤768px) — the additive half of the student
// hybrid pattern. Renders the (≤4) NavItems flagged `mobileTab`, fixed
// to the bottom of the viewport, as thumb-reachable shortcuts. Every
// tab here also exists as a drawer row and shares its active state, so
// nothing is hidden — the drawer remains the complete menu.
//
// Rendered only when the audience's nav has `mobileTab` rows (students),
// so tutor/admin (drawer-only) never get a tab bar. CSS gives
// .product-content extra bottom padding when a .m-tabbar is present so
// content/footer never sit behind the bar.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/lib/nav/types';
import { NavIcon } from '@/components/nav/shared/nav-icon';

export function BottomTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  function isActive(item: NavItem): boolean {
    if (!pathname) return false;
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  return (
    <nav className="m-tabbar" aria-label="Primary">
      {items.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.key}
            href={item.href}
            className={active ? 'm-tab is-active' : 'm-tab'}
            aria-current={active ? 'page' : undefined}
          >
            <span className="m-tab-ico">
              <NavIcon name={item.icon} />
              {active && <span className="m-tab-dot" aria-hidden="true" />}
            </span>
            <span className="m-tab-label">{item.tabLabel ?? item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
