// mynclex/components/shell/topbar.tsx
//
// Shell topbar. Server Component. Renders brand on the left and
// role-chip + user-menu on the right. Both dropdowns are Client
// Components.
//
// Two optional slots let an audience layout extend the chrome without
// the topbar needing to know which audience is mounting it:
//   - productLabel: shown next to the brand (e.g. "· Bank"). Caller
//     supplies the full string including any separator glyph.
//   - rightSlot:    rendered in the right area BEFORE the role chip
//     and user menu (e.g. <ProductSwitcher /> for student layouts).
// When a slot is omitted, the topbar collapses cleanly — existing
// callers that pass neither still work unchanged.

import Link from 'next/link';
import { UserMenu } from './user-menu';
import { RoleChip, type Role } from './role-chip';

export function Topbar({
  displayName,
  email,
  viewingAs,
  availableRoles,
  productLabel,
  rightSlot,
}: {
  displayName: string;
  email: string;
  viewingAs: Role;
  availableRoles: Role[];
  productLabel?: string;
  rightSlot?: React.ReactNode;
}) {
  const isMultiRole = availableRoles.length > 1;

  return (
    <header className="shell-topbar">
      <div className="shell-topbar-inner">
        <Link href="/router" className="shell-brand" aria-label="MyNclex-RN home">
          <span className="shell-brand-name">
            MyNclex<span className="shell-brand-accent">-RN</span>
          </span>
          {productLabel && (
            <span className="shell-brand-product">{productLabel}</span>
          )}
        </Link>

        <nav className="shell-nav" aria-label="Main navigation">
          {/* Feature links will appear here as feature slices land. */}
        </nav>

        <div className="shell-right">
          {rightSlot}
          {isMultiRole && (
            <RoleChip currentRole={viewingAs} availableRoles={availableRoles} />
          )}
          <UserMenu name={displayName} email={email} />
        </div>
      </div>
    </header>
  );
}
