// mynclex/components/role-chip.tsx
//
// Topbar role chip + switcher dropdown. Only rendered when the user
// holds more than one role. Client Component for the dropdown toggle;
// each switch action is a <form> posting to switchRoleAction (server).

'use client';

import { useEffect, useRef, useState } from 'react';
import { switchRoleAction } from '@/app/pick-role/actions';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'TUTOR' | 'STUDENT';

const LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  TUTOR: 'Tutor',
  STUDENT: 'Student',
};

// Display order for the switcher menu.
const ORDER: Role[] = ['SUPER_ADMIN', 'ADMIN', 'TUTOR', 'STUDENT'];

export function RoleChip({
  currentRole,
  availableRoles,
}: {
  currentRole: Role;
  availableRoles: Role[];
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const ordered = ORDER.filter((r) => availableRoles.includes(r));

  return (
    <div className="role-chip-wrap" ref={wrapRef}>
      <button
        type="button"
        className="role-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{LABELS[currentRole]}</span>
        <svg
          className="role-chip-caret"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2 3.5L5 6.5L8 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="shell-dropdown" role="menu">
          <div className="shell-dropdown-label">Switch workspace</div>
          {ordered.map((role) => {
            const isCurrent = role === currentRole;
            if (isCurrent) {
              return (
                <div
                  key={role}
                  className="shell-dropdown-item shell-dropdown-item-current"
                  role="menuitem"
                  aria-current="true"
                >
                  {LABELS[role]} <span aria-hidden="true">·</span> current
                </div>
              );
            }
            return (
              <form
                key={role}
                action={switchRoleAction}
                className="shell-dropdown-item-form"
              >
                <input type="hidden" name="role" value={role} />
                <button
                  type="submit"
                  className="shell-dropdown-item"
                  role="menuitem"
                >
                  {LABELS[role]}
                </button>
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}
