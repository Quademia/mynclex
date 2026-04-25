// mynclex/lib/nav/types.ts
//
// Shared types for data-driven nav configs. Each audience (student,
// tutor, admin) gets its own file exporting NavItem[] arrays. Sidebar
// components consume these arrays directly so adding/removing/reordering
// a sidebar entry is a one-line edit in one file.

export type NavIcon =
  | 'home'
  | 'book'
  | 'target'
  | 'map'
  | 'clock'
  | 'user'
  | 'calendar'
  | 'video'
  | 'check';

export type NavItem = {
  /** Stable key — used for active-state matching and React keys. */
  key: string;
  /** Display label in the sidebar row. */
  label: string;
  /** Icon identifier — sidebar resolves this to inline SVG. */
  icon: NavIcon;
  /** Full route path (including audience prefix, e.g. /student/bank/...). */
  href: string;
};
