'use client';

// mynclex/components/shell/mobile/account-sheet.tsx
//
// Mobile account sheet (≤768px). A bottom sheet, opened from the
// mobile topbar avatar or the drawer user bar, that consolidates the
// three desktop identity surfaces into one mobile place:
//   - the topbar UserMenu  → Sign out
//   - the topbar RoleChip   → Switch workspace (only when >1 role)
//   - the sidebar user bar  → the name/email/role header
//
// Sign out + role switch reuse the exact server entry points the
// desktop chrome uses (the /logout Route Handler and switchRoleAction),
// so behaviour is identical — this is purely a mobile re-housing.
//
// Profile links to the audience's profile route when one exists; admin
// has no /admin/profile yet (future), so its row renders disabled.

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { switchRoleAction } from '@/app/pick-role/actions';
import type { Role } from '@/components/shell/role-chip';

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  TUTOR: 'Tutor',
  STUDENT: 'Student',
};

// Display order for the workspace switch list (mirrors RoleChip).
const ROLE_ORDER: Role[] = ['SUPER_ADMIN', 'ADMIN', 'TUTOR', 'STUDENT'];

const ICONS: Record<string, React.ReactNode> = {
  user: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  swap: (
    <>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),
  x: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
};

function Svg({ name, size = 18 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

function getInitials(name: string, email: string): string {
  const source = name?.trim() || email || '';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return '?';
}

export function AccountSheet({
  open,
  onClose,
  displayName,
  email,
  viewingAs,
  availableRoles,
  profileHref,
}: {
  open: boolean;
  onClose: () => void;
  displayName: string;
  email: string;
  viewingAs: Role;
  availableRoles: Role[];
  profileHref?: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Move focus into the sheet when it opens.
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const initials = getInitials(displayName, email);
  const roleLabel = ROLE_LABELS[viewingAs] ?? 'Account';
  const otherRoles = ROLE_ORDER.filter(
    (r) => availableRoles.includes(r) && r !== viewingAs,
  );

  return (
    <>
      <div
        className={open ? 'm-backdrop m-backdrop-sheet is-open' : 'm-backdrop m-backdrop-sheet'}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={open ? 'm-sheet is-open' : 'm-sheet'}
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        aria-hidden={!open}
      >
        <div className="m-sheet-grip" aria-hidden="true" />
        <div className="m-sheet-head">
          <span className="m-sheet-title">Account</span>
          <button
            ref={closeRef}
            type="button"
            className="m-sheet-close"
            onClick={onClose}
            aria-label="Close"
          >
            <Svg name="x" size={17} />
          </button>
        </div>

        <div className="m-sheet-body">
          <div className="m-account-head">
            <span className="m-account-avatar" aria-hidden="true">
              {initials}
            </span>
            <div className="m-account-id">
              <div className="m-account-name">{displayName}</div>
              <div className="m-account-email">{email}</div>
            </div>
            <span className="m-role-badge">{roleLabel}</span>
          </div>

          {profileHref ? (
            <Link href={profileHref} className="m-account-row" onClick={onClose}>
              <span className="m-account-ico">
                <Svg name="user" />
              </span>
              <span className="m-account-label">Profile</span>
            </Link>
          ) : (
            <div className="m-account-row is-disabled" aria-disabled="true">
              <span className="m-account-ico">
                <Svg name="user" />
              </span>
              <span className="m-account-label">Profile</span>
              <span className="m-account-soon">soon</span>
            </div>
          )}

          {otherRoles.length > 0 && (
            <div className="m-account-switch">
              <div className="m-account-switch-label">Switch workspace</div>
              {otherRoles.map((r) => (
                <form key={r} action={switchRoleAction} className="m-account-form">
                  <input type="hidden" name="role" value={r} />
                  <button type="submit" className="m-account-row">
                    <span className="m-account-ico">
                      <Svg name="swap" />
                    </span>
                    <span className="m-account-label">{ROLE_LABELS[r]}</span>
                  </button>
                </form>
              ))}
            </div>
          )}

          <form method="POST" action="/logout" className="m-account-form">
            <button type="submit" className="m-account-row is-danger">
              <span className="m-account-ico">
                <Svg name="logout" />
              </span>
              <span className="m-account-label">Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
