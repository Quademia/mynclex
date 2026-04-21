// mynclex/components/user-menu.tsx
//
// Topbar user menu. Client Component — needs click-outside-to-close.
// The trigger is the user's initials in a circle. Opens a dropdown
// with name, email, and sign-out.
//
// Sign-out is a real form POST to /logout (a Route Handler), not an
// event handler — preserves the server-first pattern.

'use client';

import { useEffect, useRef, useState } from 'react';

export function UserMenu({ name, email }: { name: string; email: string }) {
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

  const initials = getInitials(name, email);

  return (
    <div className="user-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="user-menu-trigger"
        aria-label="User menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {initials}
      </button>

      {open && (
        <div className="shell-dropdown" role="menu">
          <div className="shell-dropdown-header">
            <div className="shell-dropdown-name">{name}</div>
            <div className="shell-dropdown-email">{email}</div>
          </div>
          <form method="POST" action="/logout" className="shell-dropdown-item-form">
            <button
              type="submit"
              className="shell-dropdown-item shell-dropdown-item-signout"
              role="menuitem"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function getInitials(name: string, email: string): string {
  const source = name?.trim() || email || '';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return '?';
}
