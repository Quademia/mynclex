# Cohort workspace fold — cohort becomes a surface inside the programme

Settled with Sam 2026-06-12. Status: **planned, not yet built.**

This doc can be deleted once the fold ships (or kept as the record of
the decision — Sam's call).

## The decision

The tutor cohort workspace (`/tutor/cohort/[id]/...` with its own
sidebar) is **retired as a separate world**. Its surfaces fold into the
programme workspace's **Cohorts tab** using the **library pattern**:
one route, URL-param navigation, in-page chrome. The programme sidebar
never swaps.

**Why** (over both the status quo and a sidebar-flatten):

- The full sidebar swap when entering a cohort is the most
  disorienting move in the tutor app; killing it gives one workspace,
  one mental model.
- Most tutors run one active cohort — today reaching Analytics is
  programme → Cohorts → pick run → Analytics; after, it's one click
  with the run framed in place.
- It completes the settled direction "programme = people & money,
  cohort = delivery": Enrolments already moved up with a `?cohort=`
  zoom; this finishes the consolidation — *cohort stops being a place
  and becomes a context*.
- vs. flattening cohort tabs into the programme sidebar: no sidebar
  growth (8 rows stay 8), no run-picker living in the chrome, no
  "two Curriculums" naming clash (a Curriculum tab inside the run's
  detail is unambiguous), and wrong-run accidents are harder because
  the run's name frames every pane.
- The library (`/tutor/library`) proved the pattern in this codebase;
  Enrolments' cohort zoom proved the `?cohort=` param. We're repeating
  ourselves, deliberately.
- Timing: only 3 of the 6 cohort tabs have real content (Curriculum,
  Analytics, Settings) — the fold is the cheapest it will ever be.

## Decisions settled in discussion

1. **Top tabs, not a side rail.** The run detail uses a horizontal tab
   bar. The library needed a left rail because its lenses hold nested
   lists; cohort panes are flat and few, and the Analytics dashboard
   wants the full content width.
2. **Sessions stays** as a placeholder tab (Sam: "we will make use of
   it soon" — the agreed Live Session Planner lands there).
3. **Announcements is dropped** until it's actually built (same
   MVP-declutter logic as the programme sidebar; restoring is one
   line in the tab config).
4. **Overview survives as the run's landing tab** (Schedule +
   Enrolment + Class-progress cards are real content) — minus its
   "Programme" card, which is pointless once you're already inside
   the programme.

## Target shape

Route: `/tutor/programme/[programme_id]/cohorts` (existing; SELF_PACED
still 404s; the sidebar entry stays mode-filtered + in the Delivery
section).

- **No `?cohort=`** → the runs list (today's page: header + cards +
  New cohort + empty state).
- **`?cohort=<uuid>`** → that run's detail:
  - **Run header**: "← All cohorts" link (back to the bare route) +
    run name + status pill + date range + seats.
  - **Tab bar**: Overview · Curriculum · Analytics · Sessions ·
    Settings. Tabs are plain `<Link>`s carrying `?cohort=&tab=` —
    no client state; the server composes per request (same cost as
    today's separate pages, since only the active tab's data is
    fetched).
  - `?tab=` absent/invalid → Overview.
- Unknown/foreign cohort uuid → a "Cohort not found" pane with a link
  back to the list (the library's ShelfNotFound precedent), not a 404.
- Param name `cohort` matches the Enrolments zoom for consistency.
- The programme sidebar's Cohorts entry stays highlighted throughout
  (active-match is pathname-based; params don't affect it).

### Tab contents (all existing machinery, moved not rebuilt)

| Tab | Content | Source |
|---|---|---|
| Overview | Schedule / Enrolment / Class-progress cards (minus Programme card); "View analytics →" becomes a tab link | old overview page body |
| Curriculum | `<CohortCurriculum tree>` (release dates + include/exclude) | unchanged component |
| Analytics | `<CohortAnalyticsView data>` | unchanged component |
| Sessions | placeholder pane (Live Session Planner lands here later) | placeholder |
| Settings | Edit-cohort + Cancel-cohort cards | old settings page body |

## Build inventory

**New (small):**

- `lib/cohorts/cohort-detail.tsx` — run header + tab bar + pane
  switch (server component; panes as small co-located components in
  `lib/cohorts/`, existing folder).
- Tab-bar + run-header CSS in `styles/cohorts.css`.
- Redirect shim: `app/(app)/tutor/cohort/[cohort_id]/[[...rest]]/page.tsx`
  — looks up the cohort's programme, maps the old tab segment
  (announcements → overview), `redirect()`s to the new URL; unknown
  cohort → 404. Replaces the whole old subtree so bookmarks survive.

**The composer:** `app/(app)/tutor/programme/[programme_id]/cohorts/page.tsx`
reads `?cohort=` + `?tab=`, branches list vs detail, fetches only the
active tab's data.

**Deleted:**

- `app/(app)/tutor/cohort/[cohort_id]/` — layout + all 7 pages
  (replaced by the one-file redirect shim).
- `components/nav/tutor/cohort-shell.tsx`, `cohort-sidebar.tsx`,
  `cohort-back-pill.tsx`.
- `TUTOR_COHORT_NAV` in `lib/nav/tutor.ts`.

**Link/plumbing updates:**

- `lib/cohorts/cohort-list.tsx` — card link → `?cohort=` URL (gains a
  `programmeId` prop from the page).
- `lib/cohorts/actions.ts` — 6 `revalidatePath('/tutor/cohort/...')`
  calls → revalidate `/tutor/programme/<pid>/cohorts`; the actions
  only hold `cohort_id`, so each does one cheap owned-row lookup for
  `programme_id` (or threads it from the caller).
- `lib/home/tutor/tutor-home.tsx` — needs-attention link →
  `/tutor/programme/<pid>/cohorts?cohort=<id>&tab=analytics`; the
  home query must also select the cohort's `programme_id` if it
  doesn't already.
- Old overview pane's internal links: "View analytics →" → tab link;
  "Manage enrolments →" unchanged (already points at the programme
  Enrolments page).

**Untouched:** student routes/experience, DB schema, RLS, admin
surfaces, the Enrolments page (its `?cohort=` zoom already matches).
No migration.

## Risks / notes

- The Cohorts page becomes the meatiest tutor page (list + 5 panes) —
  accepted; the library's `page.tsx` is the in-house precedent and is
  larger.
- Per-tab server fetch keeps request cost flat, but the composer must
  branch *before* fetching (don't fetch all five panes per request).
- The cohort Overview's enrolled-count card calls `getCohortAnalytics`
  — keep that fetch Overview-tab-only (as today).
- `formatCohortName` etc. stay in `lib/cohorts/format.ts` — header
  reuses them.

## Build steps

Ordered so the app works at every commit; the old cohort world stays
alive until the new surface is proven, then dies in one cut.

### Step 1 — Build the run detail inside the Cohorts page (additive)

The new surface lands complete while the old world still exists
(reachable by direct URL) — nothing breaks if testing finds a problem.

- Composer: `cohorts/page.tsx` reads `?cohort=` + `?tab=`; no param →
  today's runs list; `?cohort=` → the run detail. Fetch only the
  active tab's data (branch before fetching).
- New `lib/cohorts/cohort-detail.tsx`: run header ("← All cohorts" +
  name + status pill + dates + seats) + tab bar (plain `<Link>`s) +
  pane switch.
- Panes: Overview (cards minus Programme; "View analytics →" → tab
  link) · Curriculum (`<CohortCurriculum>`) · Analytics
  (`<CohortAnalyticsView>`) · Sessions (placeholder) · Settings
  (edit + cancel cards). Bodies move from the old pages.
- Guard: `?cohort=` must belong to THIS programme, else the
  "Cohort not found" pane (with a back-to-list link).
- Cohort cards (`cohort-list.tsx`) link to the new URL (gains
  `programmeId` prop) — the entry point for testing.
- Tab-bar + run-header CSS in `styles/cohorts.css`.

**Checkpoint:** click a cohort card → run detail in place, programme
sidebar still showing; all five tabs work; bad uuid → not-found pane.

### Step 2 — Rewire the remaining inbound links + refreshes

- `tutor-home.tsx` needs-attention link →
  `/tutor/programme/<pid>/cohorts?cohort=<id>&tab=analytics` (home
  query gains the cohort's `programme_id` if not already selected).
- `lib/cohorts/actions.ts`: the 6 `revalidatePath('/tutor/cohort/…')`
  calls → `/tutor/programme/<pid>/cohorts` (params don't matter to
  revalidation). Each action looks up its cohort's `programme_id`
  (one cheap owned-row query) or threads it from the caller.

**Checkpoint:** edit/cancel a cohort + toggle a curriculum row from
the NEW surface → changes appear without a manual refresh; tutor
Home's lagging-cohort link lands on the new Analytics tab.

### Step 3 — Demolition + redirect shim (the cut)

- Delete `app/(app)/tutor/cohort/[cohort_id]/` (layout + 7 pages),
  `cohort-shell.tsx` + `cohort-sidebar.tsx` + `cohort-back-pill.tsx`,
  and `TUTOR_COHORT_NAV`.
- Add the shim `app/(app)/tutor/cohort/[cohort_id]/[[...rest]]/page.tsx`:
  look up the cohort's programme, map the old tab segment
  (announcements → overview), `redirect()` to the new URL; unknown
  cohort → 404.
- Sweep: grep proves nothing references the old world; tsc + eslint
  clean; old URLs redirect correctly.

**Checkpoint:** an old `/tutor/cohort/<id>/analytics` URL lands on
the new Analytics tab; the app has no route that swaps the sidebar.

### Step 4 — Docs + session log

- This doc's status flips to built; BUILD_LIST banner; session-log
  entry in `sessions/2026-06.md`.

## Estimate

One session, all app-layer, no migration. Comparable to the
2026-06-12 enrolments move. Steps 1–3 ≈ one commit each.
