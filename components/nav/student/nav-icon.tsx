// mynclex/components/nav/student/nav-icon.tsx
//
// Maps NavIcon names to inline SVG. Icon paths copied verbatim from
// docs/product-plan/mockups/student-nav.html so the rendered sidebar
// matches the approved visual.
//
// To add a new icon: add to the NavIcon union in lib/nav/types.ts, then
// add a `case` here returning its inner SVG markup. All shapes share the
// outer <svg> wrapper so each case only describes the inner geometry.

import type { NavIcon as NavIconName } from '@/lib/nav/types';

function inner(name: NavIconName) {
  switch (name) {
    case 'home':
      return (
        <>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </>
      );
    case 'book':
      return (
        <>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </>
      );
    case 'target':
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </>
      );
    case 'map':
      return (
        <>
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </>
      );
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </>
      );
    case 'user':
      return (
        <>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </>
      );
    case 'calendar':
      return (
        <>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </>
      );
    case 'video':
      return (
        <>
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" />
        </>
      );
    case 'check':
      return (
        <>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </>
      );
  }
}

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {inner(name)}
    </svg>
  );
}
