// mynclex/lib/library/student/study-home-icons.tsx
//
// Inline SVG icon set for the student Study Home (slice 11.14c). Ported
// from the Claude Design handoff's icons.jsx (same stroke style as the
// library mockup). Kept local to the study-home surface rather than added
// to the shared nav-icon set — these are study-home affordances, not nav
// chrome.

import type { ReactNode } from 'react';

type IconProps = {
  size?: number;
  /** stroke-width; 0 for filled glyphs (play). */
  sw?: number;
  fill?: string;
};

function Svg({
  size = 16,
  sw = 2,
  fill = 'none',
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill}
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const ShIcons = {
  clock: (p: IconProps = {}) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  ),
  play: (p: IconProps = {}) => (
    <Svg {...p} fill="currentColor" sw={0}>
      <path d="M8 5v14l11-7z" />
    </Svg>
  ),
  check: (p: IconProps = {}) => (
    <Svg {...p} sw={3}>
      <path d="M5 12l5 5 9-12" />
    </Svg>
  ),
  bookmark: (p: IconProps = {}) => (
    <Svg {...p}>
      <path d="M6 4h12v17l-6-4-6 4z" />
    </Svg>
  ),
  target: (p: IconProps = {}) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </Svg>
  ),
  chart: (p: IconProps = {}) => (
    <Svg {...p}>
      <path d="M3 21V5M3 21h18M7 17v-6M12 17v-9M17 17v-3" />
    </Svg>
  ),
  doc: (p: IconProps = {}) => (
    <Svg {...p}>
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
      <path d="M14 3v6h6" />
    </Svg>
  ),
  arrowR: (p: IconProps = {}) => (
    <Svg {...p}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </Svg>
  ),
  spark: (p: IconProps = {}) => (
    <Svg {...p}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
    </Svg>
  ),
  book: (p: IconProps = {}) => (
    <Svg {...p}>
      <path d="M4 4v16h14a2 2 0 002-2V6a2 2 0 00-2-2H4z" />
      <path d="M4 4v16" />
    </Svg>
  ),
  grid: (p: IconProps = {}) => (
    <Svg {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Svg>
  ),
  folder: (p: IconProps = {}) => (
    <Svg {...p}>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </Svg>
  ),
  shelves: (p: IconProps = {}) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M3 14.5h18" />
    </Svg>
  ),
};
