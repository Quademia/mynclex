'use client';

// mynclex/components/nav/shared/sidebar-frame.tsx
//
// Shared chrome wrapper that turns any audience sidebar into the
// locked-shell column. Owns:
//   • the collapse-to-rail state (one global localStorage key —
//     toggling on the tutor sidebar carries to admin, etc.)
//   • the collapse toggle button (top of the column)
//   • an optional header slot (e.g. the student "Switch programme"
//     button above their sidebar nav)
//   • the user bar pinned at the bottom (placeholder popover for
//     settings/account; opens above the bar)
//
// The audience sidebar still renders its own <aside> + nav rows —
// this frame doesn't replace it, it surrounds it. When the frame
// is railed, CSS hides labels / sub-lists / headers inside the
// aside; the icons stay visible. Inner aside chrome (border, bg)
// is dropped via `.sidebar-frame > .sidebar` overrides in nav.css.

import { useEffect, useState } from 'react';

const LS_KEY = 'mynclex.sidebar.railed';
const TOGGLE_EVENT = 'mynclex.sidebar.railed-changed';

export function SidebarFrame({
  ariaLabel,
  header,
  children,
  userBar,
}: {
  ariaLabel?: string;
  header?: React.ReactNode;
  children: React.ReactNode;
  userBar: React.ReactNode;
}) {
  const [railed, setRailed] = useState(false);

  // Read stored preference after hydration (avoids SSR/CSR mismatch).
  useEffect(() => {
    try {
      if (localStorage.getItem(LS_KEY) === '1') setRailed(true);
    } catch {
      /* localStorage blocked — fine, default expanded */
    }
  }, []);

  // Listen for changes elsewhere (other sidebars on the page, other
  // tabs via the storage event). Keeps the one-global-preference
  // promise: collapse anywhere → all sidebars on every open tab
  // adopt the same state.
  useEffect(() => {
    function onLocal(e: Event) {
      const next = (e as CustomEvent<boolean>).detail;
      if (typeof next === 'boolean') setRailed(next);
    }
    function onStorage(e: StorageEvent) {
      if (e.key === LS_KEY && e.newValue != null) {
        setRailed(e.newValue === '1');
      }
    }
    window.addEventListener(TOGGLE_EVENT, onLocal);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(TOGGLE_EVENT, onLocal);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function toggle() {
    setRailed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LS_KEY, next ? '1' : '0');
        window.dispatchEvent(
          new CustomEvent<boolean>(TOGGLE_EVENT, { detail: next }),
        );
      } catch {
        /* localStorage blocked — state still applies for this tab */
      }
      return next;
    });
  }

  return (
    <div
      className={railed ? 'sidebar-frame is-railed' : 'sidebar-frame'}
      data-railed={railed}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="sidebar-frame-toggle"
        onClick={toggle}
        aria-label={railed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={railed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <span aria-hidden="true">{railed ? '»' : '«'}</span>
      </button>
      {header && <div className="sidebar-frame-header">{header}</div>}
      <div className="sidebar-frame-body">{children}</div>
      {userBar}
    </div>
  );
}
