# Mobile-responsive: navigation, content, and how to measure it

The reference for how MyNclex behaves on phones. Built 2026-06-21 from
the Claude Design "Mobile Navigation Redesign" prototype. See also the
CLAUDE.md UI Convention "Surfaces must be mobile-friendly".

⚠ **The filename still says "navigation" and the scope no longer does.**
Nav came first (2026-06-21); the per-surface content sweeps followed
(students and tutors, both 2026-08-20) and brought the touch-target and
measurement rules with them. The file keeps its name because CLAUDE.md
and several stylesheets point at it. Read *Touch targets* and *Measuring
a surface* before starting a sweep — they exist because every rule in
them was paid for by a wrong answer.

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
| Tutor · Programme | drawer + `drawerHeader` | — (Cohorts under a "Delivery" divider) |
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
- **Students switch programme via the topbar pill** (`centerSlot`), so
  for them the drawer can keep the default wordmark + role-badge header.
  ⚠ **This was written as a general rule and is only true of students.**
  It once read "a programme-name drawer header is a deferred polish —
  it'd need the shell to fetch the title", and both halves failed on the
  tutor side: tutors have no pill, and `programme-shell.tsx` already held
  `programmeTitle` (it passes it to `<TutorBackPill>`). The consequence
  was not cosmetic — inside a programme every drawer row points DEEPER
  into that programme, and the only route out (`<TutorBackPill>`, passed
  as `rightSlot`) renders into `.shell-topbar`, which a phone hides. A
  tutor who opened a programme on her phone had no signposted way back.
  Fixed 2026-08-20 by passing `drawerHeader` — the slot `MobileNav` had
  defined for exactly this and that no caller had ever used. See
  `components/nav/tutor/drawer-header.tsx`.
  ⭐ **The lesson is the deferral, not the header.** A decision reasoned
  through one audience was recorded as applying to all of them, and it
  removed another audience's only exit. When a shell passes `rightSlot`
  on desktop, ask what the phone equivalent is — `rightSlot` is not it.
- **Admin Profile** row in the account sheet is disabled until an
  `/admin/profile` route exists (tutor/student already have one).

## Status

- **Slice 1** (drawer + account sheet, all audiences) — built, merged?
  see SESSIONS.
- **Slice 2** (student bottom tabs) — built.
- **Slice 3** (polish: scroll-lock fix, resize-close, focus-on-open) +
  this doc + the CLAUDE.md convention.
- **Content sweep — students** (2026-08-20): seven surfaces measured and
  fixed at 375px. Library skipped.
- **Content sweep — tutors** (2026-08-20): eleven surfaces. Home,
  Programmes, Quizzes, Programme quizzes, Payments, Enquiries (+ drill-in),
  Enrolments, Curriculum, Cohort analytics, Cohort tabs, and the programme
  drawer header. Bank area and Library excluded. All nine live surfaces
  measure zero sideways scroll; the other two are "Coming soon" placeholders.
- **The PUBLIC site** (2026-08-22) — see below. Every sweep above was of
  *authenticated* surfaces; the marketing site had never been looked at,
  and it was the one with an actual hole in it.

## ⚠⚠ The public nav had no mobile navigation at all <span>fixed 2026-08-22</span>

`styles/discovery.css` hid the public link row below the breakpoint —
`.pub-nav .links { display: none }` — and **nothing replaced it.** Not a
degraded experience: on a phone the only public links in the entire
product were the brand, Log in, and Help in the footer.

⭐⭐ **Two of the four sections had NO entry point anywhere.**
`/bank-access` and `/programmes` survived only by luck, because the
landing page happens to link them in its body. **`/readiness` and
`/for-tutors` were reachable only by typing the URL** — one a product we
sell, the other the tutor door slice 2 had just been built for — on a
**phone-first** audience. ⓘ Found by grepping for every `href` to them
in the repo: the only other links to `/readiness` sit behind a login or
on its own checkout page (circular), and `/for-tutors` had none at all.

⭐ **The lesson is about where to look, not about CSS.** Six mobile
sweeps had run and all six covered surfaces you reach *after* signing
in. Nobody had checked the pages a stranger sees first.

**As built** (`components/public/public-nav.tsx`, `pub-` styles in
`discovery.css`):

- **ONE component, ONE link list.** Desktop renders the row; ≤768px the
  same array becomes a drawer. ⚠ Two components would be two lists that
  drift — the day somebody adds "Sign up" they edit one of them. Same
  reasoning as convention #4 for `lib/nav/`. `PublicNav` became
  `'use client'`, which costs nothing: it has no server data.
- **Hamburger and drawer on the RIGHT** — thumb reach on a one-handed
  phone. ⚠ **Deliberately diverges from the app's drawer, which opens
  from the left.** If the two are ever aligned, the app's is the one that
  moves.
- **`pub-` styles, NOT the app's `m-*` drawer.** ⚠⚠ Reuse would have
  *worked* — the app tokens resolve on public pages and the risky rules
  are scoped to `.shell-root`, which does not exist there — and that is
  exactly what made it the tempting wrong answer. The public site is a
  **ported design system with its own token vocabulary** bridged on
  `.pub-shell`, and it is the half most likely to be re-cut by Claude
  Design later; coupling it would let a change to one silently move the
  other. They are also different objects: the app drawer is a navigation
  *tree* (sections, collapsible parents, badges, a user bar), this one is
  five links.
- ⭐ **What IS reused is the BEHAVIOUR**, copied from
  `components/shell/mobile/mobile-nav.tsx`: close on route change
  (adjusted during render, not in an effect), Escape, body scroll lock,
  focus into the panel, and **close if the viewport grows past the
  breakpoint** — without that last one the drawer is stranded open with
  its hamburger hidden. *Share the hard-won behaviour; do not share the
  stylesheet.*
- **Log in moved INTO the drawer** (Sam). It is the only conversion
  action on the public site, so it renders as a button at the foot rather
  than a sixth link. ⓘ The counter-argument was made and overruled:
  burying navigation costs more on a marketing page than in an app,
  because it hides the product from someone who does not yet know they
  want it.
- **The inert GHS/USD toggle was deleted.** It had `tabIndex={-1}`,
  `aria-hidden`, no handler and no state, and it duplicated `.bkc-fx` on
  the purchasing surfaces — which works, and sits next to the prices it
  re-renders. ⚠ It was also the one element that *kept* its space on
  mobile while every real link was hidden.
- **Breakpoint 760 → 768.** The old number predated the app's mobile nav;
  eight pixels of disagreement is a window where the two chromes differ
  about what a phone is.

ⓘ The brand became a **product-over-parent lockup** (MyNclex over "by
Quademia") in the same change — reasoning in `domain-and-identity.md`
§2b, including why MyNclex gets no mark of its own.

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

**Third instance: tutor Enquiries (2026-08-20).** `lib/enquiries/enquiries-panel.tsx`
+ `styles/enquiries.css`. Three things it settled that the first two did not:

- ⚠ **Match the breakpoint to where the panes STACK, not to 768px.** The
  enquiries split stacks at 900px, so the drill-in is at 900px too, and its
  rules live *inside* that same `@media` block. The drill-in exists only
  because the panes stack; split across two breakpoints, the 769–900px band
  keeps the original bug and nobody thinks to look there. Same block, so
  they cannot drift apart.
- ⚠ **A derived "always something selected" default is not an entered
  state.** `selectedId` falls back to the first row — correct when the
  detail owns a column and must never be empty, and wrong once stacked,
  where it means a full detail for a lead the tutor never chose. `is-entered`
  must key off the user's ACTUAL pick, and a pick that has been filtered out
  should stop counting (which also returns her to the list when an action
  moves a lead out of the current filter).
- ⚠⚠ **Swapping the panes is not the whole fix — check where the split
  STARTS.** Here 499px of stats and toolbar sit above it, so the detail
  landed correct and still below the fold, which is the original symptom
  exactly. Scroll the split into view on BOTH transitions, from an effect
  rather than the click handler (at click time the panes have not swapped
  yet), and skip the mount run or arriving on the page scrolls past its own
  header.

**Choosing drill-in vs inline expansion.** Sam proposed opening the detail
under the tapped row. The deciding number was the detail's height: 988px,
about 1.2 screens, holding an editable notes field and message templates.
Inline expansion suits a SHORT disclosure; a full record with its own form
state belongs in a drill-in, which also gives it the whole width.

## Touch targets — 44px, and how to get there

Settled across the student sweep (2026-08-20) and refined by the tutor
sweep the same day.

⭐ **GROW the control where growing it is invisible; EXTEND THE HIT AREA
where the control size IS the design.** A transparent icon button can just
become 44px. A segmented pill in a 54px bar, a status chip, a text link or
a toggle cannot — those keep their look and gain an invisible `::after`.

⭐⭐ **Refinement: if the strip can WRAP, SIZE the controls instead.** An
invisible area only works while its neighbours stay far enough away. The
quiz badges were given an `::after` that measured perfectly on the card
surface and collided on the programme surface, where the same badges wrap
to two lines **4px apart** — each badge reached over the one below, and the
lower one (painted later) took the taps. The card surface was one long tag
name from the identical fault: its badges measure 302 inside 302. If a
container has `flex-wrap: wrap`, assume it will wrap and size the chips.
Same reasoning for controls that sit 6–7px apart in a table row.

⚠ **Never extend outward past the control's container.** An absolutely
positioned `::after` contributes to the scrollWidth of its ancestors, so an
outward hit area *invents an overflow* — done twice in one sweep, one commit
apart (`.unit-item-head` +10px, `.programme-card-head` +8px). Grow inward,
or vertically, or into known dead space; then re-measure the container.

⚠ **A declared inset is not the delivered hit area.** Subpixel rects round
away roughly 2px a side, so `inset: -10px` on a 24px control does not give
44. Measure the result; do not calculate it.

⚠⚠ **Check what the pseudo-element is already doing.** `.prog-switch::after`
is the toggle's KNOB (`.is-on::after` slides it). Reaching for the usual
`::after` there would have replaced the moving part of a switch with an
invisible rectangle. Use `::before`, and verify the knob still animates.

⚠ **An enlarged target must not steal a neighbour's taps.** After every
extension, probe the neighbours too: on the quiz cards, that the editor
link still owns its own bottom edge and the next card its top.

## Measuring a surface — and five ways the measurement lies

The tutor sweep's most reusable output. Each of these produced a confident
wrong answer that only a second check caught.

⭐⭐ **`document.scrollWidth` is not the signal.** The tutor home reported a
clean 375 while 52 elements sat past the right edge, because `overflow:
hidden` ancestors swallow the excess before it reaches the document.
Measure each CONTAINER's own `scrollWidth` vs `clientWidth`, and classify:
**SIDEWAYS** (reachable but wrong) · **CLIPPED** (destroyed — an
`overflow: hidden` box with no scroll) · **TRUNCATED** (`text-overflow:
ellipsis` + `nowrap`, usually deliberate and not a bug).

1. ⚠ **Off-screen elements report a false PASS.** `elementFromPoint` cannot
   test outside the viewport, so anything below the fold silently reports
   its visual size as its hit area. Scroll each control into view first.
2. ⚠ **A closed popover inflates everything above it.** `.qc-peek` is 236px,
   `opacity: 0` and absolutely positioned, so it added +131/+156 to its
   ancestors while being invisible and unreachable. It also self-clamps
   into the viewport when opened, so the "off-screen popup" it looked like
   was not real either.
3. ⚠ **Hit tests during a CSS transition fail.** Probing the drawer's back
   link mid-slide-in reported "not hittable"; the rect was still moving.
4. ⚠ **A labelled input's real target is its `<label>`.** The enquiries
   search measured 178x20 and sits in a label measuring 220x44 — tapping
   anywhere on it focuses the field. Check for a wrapping `<label>` before
   filing a bare `<input>` as too small.
5. ⚠ **An element under the fixed topbar reads as an overlap.** `.m-topbar`
   is z:30; a control scrolled beneath it fails "owns its own centre".

⭐ **Measure DESKTOP first, on every surface.** The student sweep found a
bug that was worse at 1198px than at 375px, which moved that fix into the
base rule. The answer differs surface by surface, so check rather than
assume the fix is phone-only.

⭐ **An empty surface measures clean.** Three tutor routes are "Coming soon"
placeholders and passed every test by having no content. Detect and report
that, or emptiness reads as health.

⚠ **`1fr` is `minmax(auto, 1fr)`, and that `auto` floor is min-content** —
so a track cannot shrink below its content however narrow the screen gets.
Found four times in one sweep, twice INSIDE a `@media` block written to
rescue narrow screens; in the programmes case the override to `1fr` removed
a fixed 340px minimum that had been capping the damage, producing a 782px
column inside 343. **An existing breakpoint is not evidence that a surface
was ever measured.** Use `minmax(0, 1fr)`.

⚠ **But do not reach for it reflexively.** Payments looked like a fifth
sighting and was not: `minmax(0, 1fr)` and `min-width: 0` both changed
nothing. The cause was `.tpay-page` having `max-width` and `margin: 0 auto`
but no `width` — `.product-content` is a COLUMN flex, so auto cross-axis
margins cancel the stretch and the box sizes to its WIDEST CHILD (633px
inside 375). `styles/cat.css` already carried a written comment about this
exact failure; assume other page wrappers are missing the same line.

⚠ **`flex-wrap: wrap` alone does nothing to an `inline-flex` with
`flex: none`** — it sizes to max-content and never meets a width its
children can wrap against. It needs `max-width: 100%` as well.

⚠ **`max-width: 100%` bounds a box against its PARENT, not against a
sibling.** Applied to the enquiries scope picker it made things worse — the
select grew to the parent's full width beside a 78px label, turning a 3px
overflow into 84. When a control must yield to a sibling, it needs to
shrink: `flex: 1 1 0` + `min-width: 0`.

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
- ⬜ **Library — the last unswept surface, and deferred on BOTH audiences.**
  Skipped by the student sweep and again by the tutor sweep, so it is a
  deliberate gap rather than an oversight on either side. It needs its own
  session: the rail keeps its 218px at 375px, squeezing the content pane to
  **57px wide** with stat cards at 36px. One file, `styles/library.css`,
  serves the tutor, programme and student shells, so one drill-in fixes all
  three — `lib/library/home-shell.tsx` already carries a `railed` /
  `is-railed` state to key off.
- ⬜ **The bank / curator area** (`/tutor/bank/*` and the authoring editors)
  — excluded from the tutor sweep by Sam as its own arc; dense editors,
  closer in shape to the runner than to a list page, and similar to the
  gamma bank side.
- Admin surfaces have had no content sweep at all — nav only.
- Picker mobile treatment. (`(focused)` — i.e. the runner — is now
  in progress; see *The runner* above.)
- Full focus-trap (Tab cycling) in the drawer/sheet — currently
  focus-on-open only.
- ⚠ **The inner scroll container.** `.shell-root` is `height: 100dvh`, so
  the DOCUMENT never scrolls — `.product-content` does. On a phone the
  address bar therefore never collapses (~60–100px lost on every page),
  with no pull-to-refresh and no tap-status-bar-to-top. Shell-level,
  touching all three audiences at once, and several things position against
  the locked shell. Its own session.
- ⬜ `.ti-stats` is 335px, so half a phone screen of KPI cards sits between
  the tutor and her enquiry queue on every visit. A layout judgement rather
  than a responsive defect — noted, not actioned.
