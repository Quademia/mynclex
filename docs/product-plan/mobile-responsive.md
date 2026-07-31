# Mobile-responsive navigation

The reference for how MyNclex behaves on phones. Built 2026-06-21 from
the Claude Design "Mobile Navigation Redesign" prototype. See also the
CLAUDE.md UI Convention "Surfaces must be mobile-friendly".

## Why

The core audience (Ghanaian nurses pursuing migration) is phone-first.
The app was built desktop-first with no responsive nav — below 640px the
sidebar just stacked on top of the page. This rebuild makes the
navigation properly mobile, **student surfaces first**.

## The rule

- **Breakpoint: 768px.** ≤768px = mobile layout; >768px = the desktop
  shell, completely untouched (including the collapse-to-rail sidebar
  toggle).
- **Students → hybrid:** a slide-in drawer **and** an additive bottom-tab
  bar.
- **Tutor & Admin → drawer only** (for now — they can adopt tabs later
  off the student implementation).
- **The drawer is always the complete menu.** Bottom tabs are additive
  shortcuts to 4 of its rows and share active state; there is no "More"
  sheet — overflow always lives in the always-available drawer.

## Architecture

Everything is additive to the existing shell; desktop is unchanged.

- **`AppShell` gained a `mobileNav` slot** (mirrors `rightSlot`). Each
  audience shell passes a configured `<MobileNav>` built from its own
  nav data. The slot renders alongside the desktop `<Topbar>`; CSS hides
  whichever isn't appropriate for the width.
- **`components/shell/mobile/`**
  - `mobile-nav.tsx` — orchestrator. Mobile topbar (hamburger · centre ·
    avatar), off-canvas drawer (the full `NavItem[]` with collapsible
    children + `section` dividers + a user bar), open/close behaviour
    (backdrop · Esc · route-change · resize-to-desktop), body
    scroll-lock, focus-on-open.
  - `account-sheet.tsx` — bottom sheet consolidating the desktop
    `UserMenu` + `RoleChip` + `SidebarUserBar`: header + Profile +
    Switch workspace (only when >1 role) + Sign out. Reuses
    `switchRoleAction` + the `/logout` Route Handler verbatim.
  - `bottom-tabs.tsx` — the student tab bar; renders the `mobileTab`
    rows.
- **`styles/mobile-nav.css`** — all `m-*` classes, loaded last so its
  `@media (max-width: 768px)` rules win over `nav.css`. The whole layer
  is `display:none` on desktop and switched on inside the breakpoint.
- **`lib/nav/types.ts`** — `NavItem` gained `mobileTab?: boolean`
  (promote to the tab bar) and `tabLabel?: string` (short tab label).
  Icons `menu` + `x` added to the `NavIcon` union.

### The 6 contexts + the student tab picks

| Context | Pattern | Bottom-4 tabs |
|---|---|---|
| Student · Bank | hybrid | Dashboard · Practice · Packs · History |
| Student · Programme | hybrid | Curriculum · Library · Quizzes · History |
| Student · Cohort | hybrid | Curriculum · Sessions · Library · Quizzes |
| Tutor · Global | drawer | — |
| Tutor · Programme | drawer | — (Cohorts under a "Delivery" divider) |
| Admin | drawer | — (permission-filtered before MobileNav) |

## Gotchas / decisions

- **Desktop-topbar hide is `:has`-scoped.**
  `.shell-root:has(.m-topbar) .shell-topbar { display:none }` so AppShell
  pages WITHOUT a `<MobileNav>` (the student **picker**, `(focused)`)
  keep their desktop topbar on a phone instead of being left
  header-less. Giving the picker a first-class mobile treatment is a
  future task.
- **`MobileNav` mounts on desktop too** but every root is `display:none`
  >768px, so it's inert. The student `ProductSwitcher` therefore renders
  twice (desktop right-slot + mobile centre) — harmless; only the visible
  one is interactive.
- **Scroll-lock is inside the breakpoint** so a lingering `m-nav-locked`
  class can never freeze the desktop layout.
- **Students switch programme via the topbar pill**, so the drawer uses
  the default (wordmark + role badge) header in every context. A
  programme-name drawer header (per the CD mock) is a deferred polish —
  it'd need the shell to fetch the title.
- **Admin Profile** row in the account sheet is disabled until an
  `/admin/profile` route exists (tutor/student already have one).

## Status

- **Slice 1** (drawer + account sheet, all audiences) — built, merged?
  see SESSIONS.
- **Slice 2** (student bottom tabs) — built.
- **Slice 3** (polish: scroll-lock fix, resize-close, focus-on-open) +
  this doc + the CLAUDE.md convention.

## Non-nav content reflow (started 2026-06-21)

The first non-nav surfaces to get a mobile pass are the **curriculum
two-panes** (student + tutor cohort). The established pattern for a
desktop rail+detail on a phone is a **drill-in**, not a shrunk
side-by-side (CD's mock used a cramped horizontal week-strip — rejected):

- No selection → the **list** (the rail) full-width.
- A selection → the **detail** full-width + a "← Weeks" back link; the
  rail hides.
- Driven by the surface's existing selection state — the student uses the
  `?unit=N` URL param (so the phone back button returns to the list); the
  tutor cohort uses local state + the on-screen back link. Toggled purely
  by CSS in the surface's own stylesheet (`@media (max-width: 768px)` +
  an `is-entered` class on the pane).

Reuse this drill-in for future two-pane surfaces.

## The runner — its own doc

The session runner (`/session/[attempt_id]`) is the `(focused)` entry that
sat in *Not done* below from 2026-06-21. It is now an arc of its own:
**`docs/product-plan/runner-mobile.md`**.

It does not follow this doc's conventions, and deliberately:

- **Breakpoint 899px, not 768px.** The runner's case/trend split needs
  924px before it can lay out honestly, so it has to switch earlier than
  every other surface.
- **Container queries, not `@media`** — keyed off `.rn` rather than the
  viewport, so the phone layout also renders truthfully inside a frame
  (the tutorial sandbox, design review).
- **Sheets, not a drill-in.** The drill-in below is right for a rail +
  detail where the detail is a destination. The runner's panels (grid,
  chart, calculator) are things you consult and dismiss without leaving
  the question, which is a sheet.

Everything else — 44px targets, reflow rather than overflow, per-surface
stylesheet — is this doc's rules.

## Not done (future)

- Tutor/admin bottom tabs (deferred by design).
- Remaining non-nav content surfaces (bank tables, editors, dashboards)
  still need their own per-surface `@media (max-width: 768px)` passes —
  the curriculum two-panes are done; the rest are pending.
- Picker mobile treatment. (`(focused)` — i.e. the runner — is now
  in progress; see *The runner* above.)
- Full focus-trap (Tab cycling) in the drawer/sheet — currently
  focus-on-open only.
- Programme-name drawer header.
