// mynclex/components/topbar.tsx
//
// Shell topbar. Server Component — data-fetching. Renders brand on the
// left, future nav links in the middle (empty today), and role-chip +
// user-menu on the right. Both dropdowns are Client Components.

import Link from 'next/link';
import { UserMenu } from './user-menu';
import { RoleChip, type Role } from './role-chip';

export function Topbar({
  displayName,
  email,
  viewingAs,
  availableRoles,
}: {
  displayName: string;
  email: string;
  viewingAs: Role;
  availableRoles: Role[];
}) {
  const isMultiRole = availableRoles.length > 1;

  return (
    <header className="shell-topbar">
      <div className="shell-topbar-inner">
        <Link href="/router" className="shell-brand" aria-label="MyNclex-RN home">
          <span className="shell-brand-name">
            MyNclex<span className="shell-brand-accent">-RN</span>
          </span>
        </Link>

        <nav className="shell-nav" aria-label="Main navigation">
          {/* Feature links will appear here as feature slices land. */}
        </nav>

        <div className="shell-right">
          {isMultiRole && (
            <RoleChip currentRole={viewingAs} availableRoles={availableRoles} />
          )}
          <UserMenu name={displayName} email={email} />
        </div>
      </div>
    </header>
  );
}
