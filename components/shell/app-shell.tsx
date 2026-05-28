// mynclex/components/shell/app-shell.tsx
//
// The chrome wrapper every authenticated page renders. shell-root →
// Topbar → body. Server Component. Each audience layout (student
// picker, student/bank, student/programme, tutor, admin) loads its
// own chrome data and wraps its content in this.
//
// Why per-audience: each audience can pass productLabel + rightSlot
// (e.g. <ProductSwitcher /> for student product spaces) without the
// shell having to know which audience is mounting it.
//
// Footer: since slice 2.9 the shell no longer renders <Footer />
// itself. Locked viewport means the only scrollable region is the
// audience's content pane, so each caller renders <Footer /> as the
// last child inside its scroll area (`.product-content` for the
// audiences with a sidebar; `.picker` for the picker).

import { Topbar } from './topbar';
import { type Role } from './role-chip';

export function AppShell({
  displayName,
  email,
  viewingAs,
  availableRoles,
  productLabel,
  rightSlot,
  children,
}: {
  displayName: string;
  email: string;
  viewingAs: Role;
  availableRoles: Role[];
  productLabel?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="shell-root">
      <Topbar
        displayName={displayName}
        email={email}
        viewingAs={viewingAs}
        availableRoles={availableRoles}
        productLabel={productLabel}
        rightSlot={rightSlot}
      />
      <div className="shell-body">{children}</div>
    </div>
  );
}
