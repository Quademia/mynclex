# MyNclex — Student Navigation Spec

*Living document. Locked in session 2026-04-24 (Claude Web).*
*Part of `mynclex/docs/product-plan/` set — sibling to `main.md`, `bank.md`, etc.*

**Visual reference:** interactive mockup at
[`mockups/student-nav.html`](mockups/student-nav.html). Open in a
browser — it renders the picker, Bank product, Programme product,
and the upsell modal across both student sub-types.

> **URLs are prefixed `/student/...`** for symmetry with the tutor and
> admin nav specs. The original spec drafted unprefixed URLs (`/picker`,
> `/bank/...`, `/programme/...`); revised during the nav scaffold
> planning session (2026-04-25) to match the cross-audience pattern.
>
> The bank-product practice surface uses the route key `practice` (not
> `bank`) to avoid the collision `/student/bank/bank`. The sidebar
> label remains "Question Bank".

---

## What this covers

The navigation shape for STUDENT role users on MyNclex. Covers
both student sub-types (bank-only, programme student), the
unified picker landing page, and the topbar product switcher
with its marketing-nudge behaviour for bank-only students.

This does NOT cover tutor, admin, or super_admin navigation —
those are separate specs in the same series.

---

## Core model

MyNclex has two separate products from the student's perspective:

- **The Bank** — NCLEX-RN question bank subscription (self-study,
  duration packs: 30 / 90 / 180 days).
- **Tutor Programmes** — week-by-week curriculum owned by a tutor,
  bundles bank access for the programme duration.

**Key principle:** these are two distinct products with no forced
integration in the UI. A programme student happens to own both
because QAcademy bundles bank access into programme enrolment —
but the student experiences them as separate spaces with their
own sidebars.

### Student sub-types

| Sub-type | Owns Bank? | Owns Programme? |
|---|---|---|
| Bank-only | Yes | No |
| Programme student | Yes (bundled) | Yes |

A "programme-only" student is not a valid state — programme
enrolment always bundles bank access per the pricing plan
(see `main.md § Pricing`).

---

## The picker (landing page)

**Every student lands on the picker after login.** No auto-redirect
into either product. This is the single entry point.

### Layout

Centered on the page:
- Greeting: "Welcome back, {first name}"
- Subtitle: "Where would you like to go?"
- Two cards side-by-side (stack on mobile):
  - **My Programme** card (left)
  - **Question Bank** card (right)

### Card states

| State | Card shows |
|---|---|
| Bank, active subscription | Title: "Question Bank". Sub: "Self-study practice · {N} days left". Clickable → Bank product. |
| Bank, no subscription *(edge case)* | Title: "Question Bank". Sub: "Renew to continue practising". Clickable → subscribe page. |
| Programme, enrolled | Title: "My Programme". Sub: "{tutor name} — {programme title} · Week {N} of {total}". Clickable → Programme product. |
| Programme, not enrolled | Title: "No programme yet". Sub: "Browse tutor programmes →". Dashed border, muted style. Clickable → public programmes listing. |

Topbar on the picker has **no product switcher** (there's nothing
to switch to yet — the picker is the switcher).

---

## The two product spaces

Each product has its own dedicated sidebar. The topbar remains
consistent across both, with a product switcher appearing only
inside a product (not on the picker).

### Bank product sidebar

| Key | Label | Page purpose |
|---|---|---|
| dashboard | Dashboard | Subscription status, recent practice, readiness snapshot |
| practice | Question Bank | Main practice surface (filters, start a set) |
| packs | Readiness Packs | Curated QAcademy-authored assessment sets |
| journey | Journey Tracker | 7-phase migration prep tool |
| history | History | Past attempts and scores |
| profile | Profile | Account and settings |

### Programme product sidebar

| Key | Label | Page purpose |
|---|---|---|
| overview | Programme Home | Announcements, next session, tutor contact |
| weeks | Weeks | Week-by-week curriculum list |
| sessions | Live Sessions | Upcoming + recorded live tutorials |
| tasks | My Tasks | Pending activities across weeks |
| profile | Profile | Account and settings |

**Note on duplication:** Profile appears in both sidebars. This is
intentional — profile is account-wide but reached from either
product context without forcing a switch first.

---

## Topbar

Sticky top of page. Present on every authenticated page
(picker + both product spaces).

### Left side

- QAcademy logo + wordmark — clicking returns the student to
  the picker (their "home"). Works from any product.
- Product label next to brand:
  - On picker: "· MyNclex"
  - Inside Bank: "· Bank"
  - Inside Programme: "· Programme"

### Right side

- **Product switcher** (inside product spaces only — not on picker):
  - Two-pill toggle: [Bank] [Programme]
  - Current product highlighted
- User menu (initials circle):
  - Click opens dropdown → name, email, Sign out

---

## Product switcher behaviour

The switcher always has **both pills visible** regardless of
student sub-type. This matters because:

1. **Programme student** — both pills work, both navigate.
2. **Bank-only student** — Bank pill is the current state,
   Programme pill acts as a marketing nudge.

### Bank-only student clicks Programme pill

Don't navigate. Pop an in-place modal:

```
[🔒] No programme yet

Tutor programmes add week-by-week structure and live
sessions on top of your bank access. Browse available
programmes to enrol.

                           [ Not now ]  [ Browse programmes ]
```

- "Not now" dismisses the modal — student stays where they were.
- "Browse programmes" navigates to the public `/programmes`
  listing page.

### Why this behaviour

- **Marketing** — every bank-only student sees the existence of
  programmes via a prominent top-bar element on every page of
  the app.
- **Non-disruptive** — clicking it doesn't break their flow
  (no unwanted navigation into a locked page).
- **Honest** — the modal states the value proposition and
  gives a real path forward (Browse) or an out (Not now).

---

## State summary

Three screens × two student sub-types = six distinct views:

| Screen | Bank-only | Programme student |
|---|---|---|
| Picker | Programme card shows "No programme yet" stub | Both cards active |
| Bank product | Full bank sidebar. Switcher's Programme pill triggers upsell modal. | Full bank sidebar. Switcher navigates freely. |
| Programme product | *(Not reachable — switcher modal intercepts)* | Full programme sidebar. Switcher navigates freely. |

---

## Implementation notes (for build phase)

### Route shape (Next.js, inside the `(app)` route group)

```
app/(app)/student/
  picker/              — the landing page
    page.tsx
  bank/                — Bank product space
    layout.tsx         — injects Bank sidebar + "· Bank" topbar label + ProductSwitcher
    page.tsx           — redirects to /student/bank/dashboard
    dashboard/page.tsx
    practice/page.tsx  — main practice surface (key 'practice', label "Question Bank")
    packs/page.tsx
    journey/page.tsx
    history/page.tsx
    profile/page.tsx
  programme/           — Programme product space
    layout.tsx         — injects Programme sidebar + "· Programme" topbar label + ProductSwitcher
    page.tsx           — redirects to /student/programme/overview
    overview/page.tsx
    weeks/page.tsx
    sessions/page.tsx
    tasks/page.tsx
    profile/page.tsx
```

### Post-login redirect logic

On successful login (or magic-link / OAuth callback), route the
student to `/picker` regardless of state. The picker reads their
subscription + enrolment state server-side and renders the right
card states.

### Switcher component

- Client component (needs click handling + modal state).
- Reads student's enrolment state from a context or prop passed
  down by the `(app)` layout.
- On Programme-pill click with no enrolment → opens the
  `<ProgrammeUpsellModal>`.

### Build order (suggested, links to existing backlog)

Nav can be built before most feature pages exist — the layout
and picker are the scaffold. Individual sidebar links go live as
their feature pages ship.

1. `(app)` layout + topbar refactor (brand click → picker,
   remove role switcher for students).
2. `/picker` page.
3. `/bank` layout + sidebar + dashboard placeholder.
4. `/programme` layout + sidebar + overview placeholder.
5. Post-login redirect wire-up.
6. Product switcher + `<ProgrammeUpsellModal>`.

Feature pages (bank practice surface, programme weeks, etc.)
hang off this scaffold as they ship.

---

## Out of scope for this spec

- Tutor navigation (separate spec).
- Admin / super_admin navigation (separate spec).
- Public pages (landing, programme listing, subscribe) — these
  sit outside the `(app)` route group and don't use this nav.
- Mobile-specific drawer/hamburger behaviour — will need a
  companion spec once desktop lands.
- Notifications bell, search, or other topbar additions — can be
  added without re-specifying; the layout has room.

---

## Related

- `main.md` — overall MyNclex product plan.
- `bank.md` — Bank product spec.
- `curriculum-authoring-ux.md` — tutor's side of programmes.
- `payments-and-enrolment.md` — how students enter these states.
- `mockups/student-nav.html` — interactive visual reference.
