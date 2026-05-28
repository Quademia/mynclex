'use client';

// mynclex/components/nav/shared/sidebar-user-bar.tsx
//
// Bottom band of every <SidebarFrame>. Visually a separate bar
// pinned at the foot of the sidebar (looks like its own row of
// chrome, distinct from the nav rows above).
//
// Slice 2.9 ships this as a placeholder — clicking opens a small
// popover above the bar with the user's name + email and a "more
// coming soon" stub. Settings / account / role-switching / sign-out
// move in later when the contents are decided. The topbar's
// existing user menu + role chip stay in place for now (Sam's
// call) so we don't lose access to anything.
//
// In railed mode the bar shrinks to just the avatar circle; the
// popover anchors to the right of the rail instead of above.

import { useEffect, useRef, useState } from 'react';

export function SidebarUserBar({
  displayName,
  email,
}: {
  displayName: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('') || '?';

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
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

  return (
    <div className="sidebar-user-bar" ref={rootRef}>
      <button
        type="button"
        className="sidebar-user-bar-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={displayName}
      >
        <span className="sidebar-user-bar-avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="sidebar-user-bar-name">{displayName}</span>
        <span className="sidebar-user-bar-chev" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="sidebar-user-bar-popover" role="menu">
          <div className="sidebar-user-bar-popover-header">
            <div className="sidebar-user-bar-popover-name">{displayName}</div>
            <div className="sidebar-user-bar-popover-email">{email}</div>
          </div>
          <div className="sidebar-user-bar-popover-stub">
            Settings, account and more coming soon
          </div>
        </div>
      )}
    </div>
  );
}
