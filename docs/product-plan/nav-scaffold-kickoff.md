# MyNclex Navigation Scaffold — Session Kickoff

*Locked 2026-04-24 (Claude Web). Part of `mynclex/docs/product-plan/`.*

---

## Session goal

Scaffold the MyNclex navigation system, starting with student.

Three navigation specs (student, tutor, admin/super_admin) were finalised
in the previous session. The spec files are in the repo at
`mynclex/docs/product-plan/`:

- `student-nav.md` + `mockups/student-nav.html`
- `tutor-nav.html` (spec + mockup combined in one file)
- `admin-nav.html` (spec + mockup combined in one file)

Read all three before proposing anything. Each mockup HTML file contains
the approved visual design — the scaffold must match it.

---

## Key behavioural requirement — SPA feel

The app must behave like a single page application. Clicking any sidebar
link or topbar control must swap only the page content — the topbar,
sidebar, and surrounding chrome stay mounted. No full page reloads, no
flicker between navigations.

Next.js's built-in client-side routing (`next/link` and the App Router)
handles this natively — the work is wiring it correctly, not adding a
new framework. The user should feel they are never "going anywhere" —
pages load right in place.

---

## Build order (3 slices, one at a time, sign-off between each)

1. **Student nav scaffold** — picker landing, `(app)/bank/*` and
   `(app)/programme/*` layouts, product switcher, upsell modal,
   post-login redirect to picker.
2. **Tutor nav scaffold** — `(app)/tutor/*` global layout with
   Programmes / My Bank / My Students / Payments / Profile, plus nested
   `(app)/tutor/programmes/[id]/*` with its own programme-scoped sidebar
   and back pill.
3. **Admin nav scaffold** — `(app)/admin/*` with permission-gated
   sidebar, Admin Permissions page (super_admin only, must be functional
   first so other buckets can be granted), all 15 items scaffolded.

---

## Scaffold discipline

- Every sidebar link routes to a real placeholder page that displays
  "Coming soon — feature X" with the page title and a note about what
  will live there. No dead links.
- Placeholder pages follow a shared `<Placeholder>` component so they
  look consistent.
- All sidebar items and permissions are data-driven (rule 4 — automation
  first). Adding a new sidebar item later must be a single-file change,
  not a hunt through the codebase.
- Build on top of the existing Slice 2.5 shell — keep the `(app)` route
  group, keep the topbar component skeleton, keep role chip and user
  menu patterns. Extend; don't rewrite.
- Mobile drawer behaviour is out of scope — desktop only for these three
  slices. Mobile gets its own companion slice later.

---

## First action in the session

Read the three spec files, then propose the full scope of the student
scaffold slice (files to create, files to modify, placeholder pages list,
route structure, integration with existing Slice 2.5 shell) for Sam's
sign-off BEFORE writing any code.

Follow the usual workflow — Claude Web plans and confirms, Claude Desktop
executes.

Update `mynclex/SESSIONS.md` at the end of the session with what landed.

---

## Related

- `student-nav.md` + `mockups/student-nav.html`
- `tutor-nav.html`
- `admin-nav.html`
- `main.md` — overall MyNclex product plan
- `bank.md` — Bank spec
