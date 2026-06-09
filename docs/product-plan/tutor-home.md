# Tutor Home

The dashboard a tutor lands on after login (`/router` → `/tutor`). It's a
**cross-programme triage view** — answers "what needs me right now, across
everything I run?" — something no single programme view can show.

`/tutor` used to redirect to `/tutor/programmes`; it now renders the home.
A **Home** entry sits at the top of the tutor global sidebar (active only
on `/tutor`). Design: Claude Design "Tutor Home" handoff, Variant B.

## Layout & what each part does

Every card/row is a link unless noted. Top to bottom:

1. **Greeting** — "Welcome back, {forename}" + today's date. Not clickable.

2. **KPI cards** (4, full-width row under the greeting):
   | Card | Shows | Click → |
   |---|---|---|
   | Active programmes | count of PUBLISHED programmes | `/tutor/programmes` |
   | Active cohorts | count of IN_PROGRESS cohorts | `/tutor/programmes` |
   | Enrolled students | distinct ENROLLED students across active cohorts | `/tutor/students` |
   | Open enquiries | count of NEW + CONTACTED enquiries; **amber** when > 0 | — (no link; the list below is the action path) |

3. **Needs your attention** (hero card). Two groups, or a green
   "You're all caught up" when both are empty:
   - **New enquiries** — name · programme · age, "New" badge if never
     contacted. **Reply** → `/tutor/programme/{id}/enquiries`. Capped at 6
     (the Open-enquiries KPI is the overflow path).
   - **Cohorts falling behind** — cohort · programme · signal
     ("avg 32% complete · 4 not started") + severity dot/bar (red = avg
     < 40%, amber otherwise). Row → `/tutor/cohort/{id}/analytics`.
     Flagged when avg < 60% **or** any student hasn't started.

4. **This week** — 7-day timeline of live sessions (today highlighted).
   A session chip → `/tutor/programme/{id}/sessions`. Empty → "No sessions
   scheduled this week."

5. **Your programmes** — cards with a completion meter + health label
   (On track / Needs a look). Card → `/tutor/programme/{id}/overview`.
   "+ New programme" → `/tutor/programmes`.

6. **Your workspace** — Bank / Quizzes / Library, each a count + a
   loose-ends signal. Cards → `/tutor/bank/all`, `/tutor/quizzes`,
   `/tutor/library`.

**Brand-new tutor** (no programmes): the body is replaced by a "set up
your first programme" hero + 3 getting-started steps → `/tutor/programmes`.

## Where the data comes from

| Piece | Source |
|---|---|
| KPI counts | `getMyProgrammes`, `getCohortsForProgramme` + `cohortStatus`, completion analytics (enrolled), `getEnquiriesForProgramme` |
| New enquiries | `lib/enquiries/queries` — open enquiries across all programmes, newest first |
| Cohorts behind + programme health | `getCohortAnalytics` (`lib/analytics/tutor/cohort-queries`) per IN_PROGRESS cohort — real numbers, match the Analytics tab |
| This week | `nclex_programme_activities` of type `ONLINE_LIVE_SESSION`, `payload.scheduled_at` within 7 days |
| Workspace | `nclex_tutor_questions` counts, `getMyQuizzes`, `getLibraryOverviewStats` |

**Completion: full reuse, no migration.** Falling-behind cards + programme
meters run `getCohortAnalytics` once per active cohort — fine at v1 scale.
*Scale caveat:* if a tutor ever has enough cohorts/students that the home
feels slow, cache this layer then.

## Files

**New:**
- `lib/home/tutor/types.ts` — the `TutorHomeData` shapes.
- `lib/home/tutor/home-queries.ts` — `getTutorHomeData()` orchestrator.
- `lib/home/tutor/tutor-home.tsx` — the server-rendered view.
- `styles/tutor-home.css` — ported CD styles (`.th-` prefix).

**Changed:**
- `app/(app)/tutor/page.tsx` — renders the home (was a redirect).
- `lib/nav/tutor.ts` — adds the **Home** entry.
- `lib/nav/types.ts` — new `exact` flag on `NavItem`.
- `components/nav/tutor/global-sidebar.tsx` — honours `exact`.
- `app/(app)/layout.tsx` — imports `tutor-home.css`.

## v1 divergences from the mock (deliberate)

- **Live sessions are labelled by programme**, not cohort (`scheduled_at`
  lives on the programme-template activity, shared across cohorts).
- **Open-enquiries KPI isn't a link** — there's no global enquiry queue;
  the other three KPIs link.
- Day/time for sessions render in the server clock (UTC ≈ the Ghana-core
  audience); revisit for multi-timezone display.
