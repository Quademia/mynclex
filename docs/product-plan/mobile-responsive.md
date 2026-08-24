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
- ✅ **The library — SWEPT 2026-08-24** (reader + list shell, student side,
  plus the tutor's student-preview per Sam's amendment). See *The library
  sweep* below for what shipped, what the inventory corrected, and the two
  pieces left open.
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

---

## ✅ The library sweep — scoped AND built 2026-08-24

The last unswept surface, skipped by the student sweep *and* the tutor
sweep. Scoped in the morning, inventoried and built the same day, in four
commits on `claude/work-session-021f1e`.

### ⭐ SCOPE: the student side — **and the tutor's preview of it**

**Tutor authoring stays desktop.** Tutors write notes on a computer; making
a 6,700-line editor reflow spends the effort where the audience is not. The
**student** side is the opposite — the core audience is phone-first, and a
student who cannot read her tutor's notes on a phone cannot use the
product.

⭐ **Sam amended this mid-session, and the amendment matters:** *"scoped the
tutor side out — that's the tutor AUTHORING side, but the tutor preview as
student side is in essence same as student view so we should probably do
it."* The programme-library preview is the student surface shown to a
tutor, so it was brought in. ⚠ Without that, wrapping it in `.slm` would
have been **worse than leaving it alone** — the layer hides `.lens-side`,
so the preview would have had no lens navigation at all on a phone.

### What the numbers were, and are

All measured live at 375px on dev, signed in as a student.

| | before | after |
|---|---|---|
| Notes pane (`.lib-main`) | **57px** | **311px** |
| …of which unreachable | 40px (see below) | — |
| Lens navigation | 84 items @ 28.8px | 84 sheet rows @ ≥44px |
| Reader controls | 30.8 / 41 / 41 / 19.5px | 44 / 44 / 44 / 48px |
| Contents on a long note | absent | bottom sheet + progress |
| Practice back link | 25.3px | 44px |
| `library.css` media queries | 9, none at 768 | 6, all tutor-side |

⚠ **"57px" understates it.** `.lib-main` overflowed its box by 82px while
`.product-content` could only scroll 42px sideways, and the shell locks the
document scroll — so **40px of the hero was unreachable at any gesture**.
Not clipped-but-scrollable: gone.

### ⚠⚠ Four things the plan or the handoff had WRONG

Every one was caught by measuring rather than reading, and each would have
shipped silently.

1. **"There are TWO readers, one per student mount" — FALSE.** Both student
   mounts (cohort *and* programme) import the same `ReadNoteView` and the
   same `StudentLibraryShell`. The `lib/library/programme/*` pair is used
   **only** by `app/(app)/tutor/programme/[id]/library/...` — it is the
   TUTOR's preview. This doc asserted the false version, the CD handoff
   inherited it, and it would have sent the implementer to wrap a tutor
   surface that the scope excluded. ⓘ It also *deleted* a decision: there
   was never a shared read shell to extract first.

2. **Two of the "four student screens" were already done.**
   `styles/student-practice.css` is mobile-first and already keyed at
   769px. Measured live: zero overflowing elements, 6 of 7 controls ≥44px.
   The sweep was two screens, not four.

3. **The runner's phone layout is structurally unreachable inside a note.**
   `runner-mobile.css` keys every rule to `@container rn`, and the library
   establishes no such container — verified in the live DOM: **zero `.rn`
   elements, zero container ancestors of the player.** So the embed player
   keeps `margin-left: 32px` and 40px targets at every width, and no
   amount of CSS in the library can reach it. Not "unswept" — unreachable.

4. **The lab-values table crushes; it does not overflow.** This doc said it
   needed a scroll container. It is `table-layout: fixed; width: 100%`, so
   at 375px four columns squeeze to ~85px each and stay inside the box. The
   table that genuinely overflows is the *authored* one
   (`.lib-table-block-readonly`, a plain div with no `overflow-x` and
   `min-width: 48px` cells) — which this doc did not mention.

### ⚠⚠ The trap that would have broken the build

**A sheet inside a container query cannot be `position: fixed`.**
`container-type` applies **layout containment**, which makes the container
the containing block for `fixed` *and* `absolute` descendants. `.slm` and
`.rdm` are `min-height: 100%` and grow with the page, so a sheet left
inside either pins to the **note list**, not the screen — on a 38-note
library, `bottom: 0` lands thousands of pixels below the fold. The sheet
opens somewhere nobody can see, and nothing errors.

The CD handoff shipped both sheets as `position: absolute`, which fails
identically. **Both are now portalled to `<body>`**, which is what makes
`fixed` mean the viewport again — the same thing `.m-drawer` has always
relied on by living at shell level.

ⓘ `runner-mobile.css` dodged this by giving `.rn` a fixed `height: 100dvh`,
so absolute-bottom *is* screen-bottom. **That trick does not transfer to a
page that grows with its content.** Recorded in the header of
`styles/library-read-mobile.css`, not only in a commit message.

### Deviations from the CD design, and why

- **768px, not the handoff's 899.** 899 is the *runner's* number, earned by
  `.rn-split` needing 924px; the reader has no split. With the desktop
  sidebar open the region is `viewport − 275`, so 899 handed phone chrome
  to every viewport up to **1174px** — ordinary laptops. Caught by seeing a
  back-arrow and a star on a 1081px desktop.
- **The Resume chip was `sticky; height: 0`** — it painted across the
  note's `<h1>` at scroll 0 and both were unreadable. Now in flow.
- **The contents pill was 36px.** Grown to 44 (the plan's GROW rule; the
  bar is 55px, so there was room).
- **Its `.slm .mpr-*` rules matched nothing.** Both practice routes render
  their views directly and never pass through `StudentLibraryShell`, so
  they never had the `.slm` wrapper those rules require. Same failure mode
  as item 3 above — a layer keyed to a container that is not in the tree.
- **Dropped its hardcoded `calc(84px + safe-area)` tab-bar clearance.**
  `mobile-nav.css` already reserves it *conditionally* on a tab bar
  existing (`.shell-root:has(.m-tabbar)`). Repeating it doubled the gap for
  students and, since the bottom bar is students-only, would have stranded
  84px of nothing under the tutor's preview.

### ⭐ The structural decision worth keeping

**The lens tree is built once as data and rendered twice** — the desktop
sidebar maps it to `LensSection`/`LensLink`, the phone Browse sheet to
rows. The chips are a shortcut; the sheet is the whole menu, the same
contract the app drawer keeps. The only way to keep that true through later
edits is for there to be **one list**: adding a lens reaches both surfaces,
where adding it to one of two JSX trees would not, and nothing would report
the omission.

Verified numerically, which is the point: **84 sheet rows against 84
desktop lens items** on the student mount, **79 against 79** on the
tutor's.

Same reasoning produced `read-compact-chrome.tsx`, shared by both readers —
the preview's whole job is to show what the student sees, so a copy would
stop being a preview the first time either was touched. The differences
ride in as props (a bookmark that writes vs one that toggles locally; a
nav guard vs none; the Resume chip, which the tutor has no state for).

### ⭐ Desktop keeps its auto-jump; the phone deliberately does not

Opening a note has always jumped to the saved heading. On a phone that
drops the reader mid-note with the title and the Contents pill already
scrolled past, so the student cannot tell what she is looking at or that a
jump happened — and it would make the Resume chip nonsense, offering to
take her where she already is. The compact branch leaves her at the top and
lets her choose.

### ⏭ Left open

- ⬜ **The embed player** (`lib/library/student/embed-player.tsx`, 664
  lines). Its own slice, on the runner-mobile pattern. ⚠ It cannot be
  fixed by copying `.rn`: that class carries `container-type: size` and
  `height: 100dvh`, which would break the note around it. It needs a
  second, inline-size container sharing the name.
- ⬜ **PDF blocks.** "Download it" may be the honest phone answer.
- ⬜ **The Tags lens is 56 of 84 lens rows and 1651px of a 2716px rail** —
  measured on 38 notes, with **40 of the 56 tags used exactly once (71%)**.
  On a 3-note folder the main pane is 529px but the page scrolls **3.6
  screens**, driven entirely by the rail. Raised by Sam 2026-08-24;
  designed, not built. Agreed shape: a **grouping threshold** (show tags
  used on 2+ notes by default — 16 of 56 — with "Show all 56 tags"), plus
  a **max-height + internal scroll on the expanded RAIL only**. The cap is
  deliberately not applied to the Browse sheet, which is already
  `max-height: 78%` with its own scroll — a cap there would nest a
  scrollport inside a scrollport; the sheet gets its relief from the
  threshold instead. Projected: rail 2716px → ~1473px, the 3-note page
  3.6 → ~1.8 screens, **and bounded thereafter regardless of tag count**.
  ⚠ Removing rare tags from the lens outright is NOT an option: list-row
  tag chips are `<span>`, not links (correctly — the row is already a
  `<Link>` and anchors cannot nest), so a tag that leaves the lens leaves
  navigation. ⓘ 71% single-use tags is a curation signal as much as a
  layout one; `manage-tags-modal.tsx` can merge and rename.
- ⓘ **The tutor preview's reading column is 295px against the student's
  311.** The preview wraps itself in `.lib-page` and the student reader
  does not, so it has been 48px narrower **at every width since it
  shipped** — invisible at 1005px, plain at 375. Half was closed; the rest
  needs restyling an ancestor, which a container query cannot reach, so it
  would cost a viewport-keyed rule. Left deliberately.

### ⚠ Verification status

The tutor preview shell and reader **were** verified — the session had
tutor access, unlike the previous session's tutor UI. Everything in the
tables above was measured live before the dev server was stopped. Nothing
was re-checked after the final commit, because the session ended with the
server down.
