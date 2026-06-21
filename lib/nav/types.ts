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
  | 'users'
  | 'calendar'
  | 'video'
  | 'check'
  | 'card'
  | 'layers'
  | 'chart'
  | 'edit'
  | 'arrow-left'
  | 'chevron-down'
  | 'tutor'
  | 'apply'
  | 'tag'
  | 'flag'
  | 'mail'
  | 'alert'
  | 'shield'
  | 'settings'
  // Editor formatting icons (slice 11.5 follow-on) — paths drawn
  // from Lucide (MIT) to match the existing icon style.
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'code'
  | 'link'
  | 'heading-2'
  | 'heading-3'
  | 'list-bulleted'
  | 'list-numbered'
  | 'quote'
  // Second wave (slice 11.5 expanded-toolbar follow-on)
  | 'highlight'
  | 'subscript'
  | 'superscript'
  | 'text-color'
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'undo'
  | 'redo'
  | 'clear-formatting'
  | 'horizontal-rule'
  | 'code-block'
  // Block icons (slice 11.6 — visual & media blocks)
  | 'image'
  | 'file-text'
  | 'table'
  // Mobile-nav chrome (2026-06) — hamburger + close glyphs for the
  // ≤768px drawer/topbar.
  | 'menu'
  | 'x';

export type NavItem = {
  /** Stable key — used for active-state matching and React keys. */
  key: string;
  /** Display label in the sidebar row. */
  label: string;
  /** Icon identifier — sidebar resolves this to inline SVG. */
  icon: NavIcon;
  /** Full route path (including audience prefix, e.g. /student/bank/...). */
  href: string;
  /**
   * Optional sub-items for collapsible parent rows (e.g. Tutor "My Bank ▾").
   * Sidebars that don't support nesting render these flat or ignore them.
   */
  children?: NavItem[];
  /**
   * When true, the row is "active" only on an exact pathname match
   * rather than the default `pathname.startsWith(href)`. Used by index
   * routes whose href is a prefix of every sibling (e.g. tutor Home at
   * `/tutor`, which would otherwise highlight on every `/tutor/*` page).
   */
  exact?: boolean;
  /**
   * Optional section grouping. When set, sidebars that support sections
   * render a divider + this label above the item (once per consecutive
   * run of the same section). Used by the tutor programme sidebar to set
   * the mode-specific "Delivery" group (Cohorts) apart from the tabs
   * common to both delivery modes. Sidebars that don't support sections
   * ignore it.
   */
  section?: string;
  /**
   * Optional permission key required to see this item. Used by the admin
   * sidebar; ignored by audience configs that don't gate (student, tutor).
   *
   *   - `undefined` / `null`: visible to anyone with the audience role.
   *   - `'SUPER_ADMIN'` (sentinel): visible only when the user holds the
   *     SUPER_ADMIN role — not a permission lookup.
   *   - any other string: a permission bucket key (e.g. `'BANK_CURATE'`)
   *     looked up in `nclex_admin_permissions`. SUPER_ADMIN bypasses.
   *
   * Permission keys use SCREAMING_SNAKE_CASE in code, matching what the
   * existing `BANK_CURATE` and `PAYMENTS_MANAGE` rows seed. The admin
   * spec uses dotted-lowercase form (e.g. `bank.manage`) — see
   * lib/nav/admin.ts for the canonical mapping.
   */
  permission?: string | null;
  /**
   * When true, this item is promoted to the mobile bottom-tab bar
   * (≤768px) as an additive shortcut — it still renders as an ordinary
   * row in the drawer. Used by the student nav configs (hybrid pattern);
   * tutor/admin are drawer-only so they leave this unset. Consumed by
   * the mobile bottom-tab bar (mobile-nav Slice 2). At most 4 per
   * context, in array order.
   */
  mobileTab?: boolean;
  /**
   * Optional short label for the mobile bottom-tab cell, where the full
   * `label` is too long to fit (e.g. "Question Bank" → "Practice",
   * "Quiz History" → "History"). Falls back to `label`. Only consulted
   * for `mobileTab` rows.
   */
  tabLabel?: string;
};
