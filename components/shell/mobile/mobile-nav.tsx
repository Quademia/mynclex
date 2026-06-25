'use client';

// mynclex/components/shell/mobile/mobile-nav.tsx
//
// Mobile navigation chrome (≤768px). Rendered via AppShell's
// `mobileNav` slot; each audience shell passes a configured instance
// built from its own NavItem[] + chrome data. Above 768px every piece
// here is hidden by CSS (the desktop topbar + sidebar take over).
//
// Three surfaces:
//   - the mobile topbar  : hamburger (opens drawer) · centre slot
//     (students: ProductSwitcher pill; tutor/admin: wordmark) · avatar
//     (opens the account sheet).
//   - the drawer         : the COMPLETE menu off-canvas — the same rows
//     as the desktop sidebar, with collapsible children + `section`
//     dividers + a per-context header + a user bar.
//   - the account sheet  : <AccountSheet> (consolidated identity).
//
// Students additionally get a bottom-tab bar — that lands in Slice 2.
//
// State only matters ≤768px (the hamburger/avatar that toggle it are
// display:none above the breakpoint, so the overlays stay closed on
// desktop). Drawer/sheet close on route change + Escape; body scroll
// locks while either is open.

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/lib/nav/types';
import { NavIcon } from '@/components/nav/shared/nav-icon';
import { AccountSheet } from './account-sheet';
import { BottomTabBar } from './bottom-tabs';
import type { Role } from '@/components/shell/role-chip';

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  TUTOR: 'Tutor',
  STUDENT: 'Student',
};

function getInitials(name: string, email: string): string {
  const source = name?.trim() || email || '';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return '?';
}

function ChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function MobileNav({
  displayName,
  email,
  viewingAs,
  availableRoles,
  items,
  centerSlot,
  drawerHeader,
  profileHref,
  badges,
}: {
  displayName: string;
  email: string;
  viewingAs: Role;
  availableRoles: Role[];
  items: NavItem[];
  /** Topbar centre. Students pass <ProductSwitcher/>; default = wordmark. */
  centerSlot?: React.ReactNode;
  /** Drawer header. Programme/cohort pass name + Switch programme; default = wordmark + role badge. */
  drawerHeader?: React.ReactNode;
  /** Account-sheet Profile target; omit where no route exists yet (admin). */
  profileHref?: string;
  /** Per-NavItem.key count badges (e.g. { enquiries: 3 }) shown in the drawer. */
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  // Close everything when the route changes (tapped a link). React's
  // "adjust state during render" pattern — preferred over an effect
  // (avoids the cascading-render set-state-in-effect path).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setDrawerOpen(false);
    setAccountOpen(false);
  }

  // Escape closes whichever overlay is open.
  useEffect(() => {
    if (!drawerOpen && !accountOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        setAccountOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen, accountOpen]);

  // Lock the page scroll while an overlay is open (the only scrollable
  // region in the locked shell is .product-content).
  useEffect(() => {
    const locked = drawerOpen || accountOpen;
    document.body.classList.toggle('m-nav-locked', locked);
    return () => document.body.classList.remove('m-nav-locked');
  }, [drawerOpen, accountOpen]);

  // Move focus into the drawer (its close button) when it opens, so
  // keyboard/screen-reader users land inside the panel.
  useEffect(() => {
    if (drawerOpen) drawerCloseRef.current?.focus();
  }, [drawerOpen]);

  // If the viewport grows past the mobile breakpoint while an overlay is
  // open, close it — the hamburger/avatar that control it are hidden on
  // desktop, so a lingering-open state would otherwise be stranded.
  useEffect(() => {
    function onResize() {
      if (window.innerWidth > 768) {
        setDrawerOpen(false);
        setAccountOpen(false);
      }
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const initials = getInitials(displayName, email);
  const roleLabel = ROLE_LABELS[viewingAs] ?? 'Account';

  // Additive bottom tabs — students flag rows with `mobileTab`; tutor/
  // admin leave it unset, so they get no tab bar (drawer-only).
  const tabItems = items.filter((item) => item.mobileTab);

  function isActive(item: NavItem): boolean {
    if (!pathname) return false;
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }
  function childActive(item: NavItem): boolean {
    return !!item.children?.some((c) => isActive(c));
  }

  // Build the drawer rows: section dividers + collapsible parents +
  // leaf links, in config order.
  const navRows: React.ReactNode[] = [];
  let lastSection: string | undefined;
  items.forEach((item) => {
    if (item.section && item.section !== lastSection) {
      navRows.push(
        <div key={`sec-${item.section}`} className="m-nav-section">
          <span>{item.section}</span>
        </div>,
      );
    }
    lastSection = item.section;

    if (item.children && item.children.length > 0) {
      const open = expanded[item.key] ?? childActive(item);
      navRows.push(
        <div key={item.key} className="m-nav-group">
          <button
            type="button"
            className={
              childActive(item) ? 'm-nav-row is-parent is-active' : 'm-nav-row is-parent'
            }
            aria-expanded={open}
            onClick={() =>
              setExpanded((s) => ({ ...s, [item.key]: !(s[item.key] ?? childActive(item)) }))
            }
          >
            <NavIcon name={item.icon} />
            <span className="m-nav-label">{item.label}</span>
            <span className={open ? 'm-nav-chev is-open' : 'm-nav-chev'}>
              <NavIcon name="chevron-down" />
            </span>
          </button>
          {open &&
            item.children.map((c) => (
              <Link
                key={c.key}
                href={c.href}
                className={isActive(c) ? 'm-nav-row is-child is-active' : 'm-nav-row is-child'}
                aria-current={isActive(c) ? 'page' : undefined}
              >
                <span className="m-nav-label">{c.label}</span>
              </Link>
            ))}
        </div>,
      );
    } else {
      const badge = badges?.[item.key];
      navRows.push(
        <Link
          key={item.key}
          href={item.href}
          className={isActive(item) ? 'm-nav-row is-active' : 'm-nav-row'}
          aria-current={isActive(item) ? 'page' : undefined}
        >
          <NavIcon name={item.icon} />
          <span className="m-nav-label">{item.label}</span>
          {badge && badge > 0 ? (
            <span className="m-nav-badge" aria-label={`${badge} new`}>
              {badge > 9 ? '9+' : badge}
            </span>
          ) : null}
        </Link>,
      );
    }
  });

  return (
    <>
      {/* Mobile topbar */}
      <div className="m-topbar">
        <button
          type="button"
          className="m-icon-btn"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <NavIcon name="menu" />
        </button>
        <div className="m-topbar-center">
          {centerSlot ?? (
            <span className="m-wordmark">
              MyNclex<span className="m-wordmark-accent">-RN</span>
            </span>
          )}
        </div>
        <button
          type="button"
          className="m-avatar"
          aria-label="Account"
          onClick={() => setAccountOpen(true)}
        >
          {initials}
        </button>
      </div>

      {/* Drawer */}
      <div
        className={drawerOpen ? 'm-backdrop is-open' : 'm-backdrop'}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={drawerOpen ? 'm-drawer is-open' : 'm-drawer'}
        aria-label="Menu"
        aria-hidden={!drawerOpen}
      >
        <div className="m-drawer-close-row">
          <button
            ref={drawerCloseRef}
            type="button"
            className="m-icon-btn"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          >
            <NavIcon name="x" />
          </button>
        </div>

        <div className="m-drawer-header">
          {drawerHeader ?? (
            <div className="m-drawer-brand">
              <span className="m-wordmark">
                MyNclex<span className="m-wordmark-accent">-RN</span>
              </span>
              <span className="m-role-badge">{roleLabel}</span>
            </div>
          )}
        </div>

        <nav className="m-drawer-nav" aria-label="Section navigation">
          {navRows}
        </nav>

        <button
          type="button"
          className="m-drawer-userbar"
          onClick={() => {
            setDrawerOpen(false);
            setAccountOpen(true);
          }}
        >
          <span className="m-userbar-avatar" aria-hidden="true">
            {initials}
          </span>
          <span className="m-userbar-name">{displayName}</span>
          <span className="m-userbar-chev">
            <ChevronRight />
          </span>
        </button>
      </aside>

      <AccountSheet
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        displayName={displayName}
        email={email}
        viewingAs={viewingAs}
        availableRoles={availableRoles}
        profileHref={profileHref}
      />

      {tabItems.length > 0 && <BottomTabBar items={tabItems} />}
    </>
  );
}
