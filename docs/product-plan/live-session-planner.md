# Live sessions — template marker + cohort planner

*Design agreed with Sam 2026-06-06, deepened + open decisions resolved
2026-06-14. Status: **DESIGN AGREED, NOT YET BUILT.** Timing (Sam,
2026-06-08): build during the cohort-level MVP sweep — it lives mostly
on the cohort side.*

Part of the `mynclex/docs/product-plan/` set. Hosts on the cohort
**Sessions** tab (kept as a placeholder by the cohort-workspace fold for
exactly this — see
[cohort-workspace-fold.md](cohort-workspace-fold.md)). Sibling to
[cohort-specific-activities.md](cohort-specific-activities.md) — the two
mechanisms are complementary (one-off *lesson* → cohort-only activity;
one-off *live session* → planner).

---

## The conflict

A live session is the **one activity type whose data isn't shareable
content.** Every other type (Text, PDF, External link, Mock, Practice
quiz, Library Note, Shelf) is genuine authored content — identical for
every cohort. A live session's **date, join link, and recording are
per-run**: each intake meets at its own time, on its own link, with its
own recording.

Today all of that is stored on the **programme-template** activity
payload (`ActivityPayloadOnlineLiveSession` in
[lib/curriculum/types.ts](../../lib/curriculum/types.ts) —
`scheduled_at` / `duration_minutes` / `join_url` / `recording_url`). So
every cohort shares one time/link/recording, which is wrong: a template
authored months ago shows a stale time, the tutor Home "This week" block
([getUpcomingSessions](../../lib/home/tutor/home-queries.ts)) reads
wrong, and the student viewer
([online-live-session-viewer.tsx](../../lib/curriculum/online-live-session-viewer.tsx))
shows the stale time. It's the single exception to "template = shared
content."

## Why it happens — a live session is an *event*, not content

Modelling it as an activity was a category mismatch. A live session is
three things wearing one coat:

- **Before** → a *calendar event* ("be here Thursday 7pm, here's the
  link").
- **During** → happens entirely outside the app (Zoom / Meet).
- **After** → the *recording*, which **is** content (an async video).

It legitimately has an activity-like **position** in the curriculum (a
block anchors around it: pre-read → live call → post-quiz), but its
**nature** was never "content." The fix separates the two: keep its
curriculum position as a marker; move its event nature to a per-cohort
planner.

---

## The design (three levels)

### 1. Programme / template — the live session as a MARKER

The live session stays an activity **type**, but holds only:
- **title / topic**
- its **position** in the curriculum (which unit/week, which block)
- an optional **typical duration** hint ("our tutorials run ~90 min" —
  a *design* property, shared across cohorts)

**No date, no link, no recording.** The tutor authors the *rhythm*
once; students see "Week 3 has a live call"; build-once is preserved.

### 2. Cohort — the Live Session Planner

A per-cohort surface (the cohort **Sessions** tab) that holds the per-run
reality: **date/time · join details · recording (after).** One schedule
per marker. The tutor Home "This week" block and the student viewer read
from the **planner**, never the template.

### 3. V2 — a managed sessions system (add-on)

A future, larger feature: cross-cohort **calendar**, automated
**reminders/emails**, **Zoom/Meet API integration** (auto-create
meetings, auto-pull recordings), **attendance** tracking, a searchable
**recordings library**, reschedule/cancel notices. Built so it *extends*
the thin planner's data (same rows, enriched) rather than replacing it.
**Attendance is pulled forward as a near-term follow-on — see below.**

---

## How the planner links to the marker

A small cohort-keyed table, the same shape as the cohort checklist's
`(cohort, activity) → dates`:

```
nclex_cohort_live_sessions            (name TBD)
  cohort_id           → nclex_cohorts
  marker_activity_id  → nclex_programme_activities  (the live-session marker)
  scheduled_at, duration_minutes(optional override), recording_url
  + connection fields (see "Session editor rework" below)
  created_at, updated_at
  UNIQUE (cohort_id, marker_activity_id)
```

Keyed on **(cohort_id, marker_activity_id)**. The planner reads all
live-session markers in the curriculum (from the template) and joins each
to its schedule (by activity id). **A marker with no planner row =
"unscheduled" for that cohort.**

The title/topic + typical duration always come from the **marker**; the
planner row only adds the per-run *when / where / recording*.

---

## One-off (cohort-specific) sessions — Option B

A bonus session for just one intake is added **directly in the planner**
("+ Add session"), in **one step** — title + which week + date/link.
Behind the scenes that **auto-creates a cohort-only marker** (the
mechanism from [cohort-specific-activities.md](cohort-specific-activities.md):
a `cohort_id`-tagged `nclex_programme_activities` row of type
`ONLINE_LIVE_SESSION`, no schedule payload) **plus** the planner schedule
row — so the session appears in that week's curriculum *in context* and
on the sessions list, exactly like a designed session.

**The tutor never does double entry.** Marker creation is invisible.
And note: tutors do **not** pick "live session" in the cohort-only
*activity picker* — the planner owns live-session creation end to end;
the cohort-only *row* is an implementation detail.

**Symmetry (the two directions of one rule):**
- *Designed session:* marker exists (template, inherited) → tutor fills
  the schedule per cohort.
- *One-off session:* tutor creates the schedule → system fills the
  (cohort-only) marker.

Either way you end with **marker + schedule = a complete session.**

---

## Integrity rule — an included marker needs a schedule

A live session is two halves; neither alone is deliverable. So:

**If a session marker is included (and visible) for a cohort but has no
scheduled planner row, that's an incomplete state** — students would be
told a call exists with no date or link.

- **Soft-warn, never hard-block.** The tutor may include now and
  schedule later, but it's flagged: a **"needs scheduling →"** cue on the
  checklist row (links to the Sessions tab) and the marker shown as
  **unscheduled** in the planner. (Same philosophy as the cohort-only
  "not visible yet" nudge and the bank publish-integrity gates.)
- **"Scheduled / done" = has a date + join details.** The **recording**
  is *not* required — it's filled after the session airs.
- **Student fallback:** an included-but-unscheduled session shows as
  **"Date to be announced,"** never broken.

Bidirectional: the **checklist** warns "needs a time"; the **planner**
is where you resolve it.

---

## Completion — a live session does NOT count (v1)

Attendance happens off-platform (Zoom/Meet) and we can't reliably track
who showed up in v1. So a live session is **excluded from the completion
denominator** — it never drags a student's progress % down — and renders
**without a done-checkbox** (it's an event, not a task). No self-report,
no fake "watched the recording" proxy.

> **▶ CAPTURE (Sam, 2026-06-14): build an attendance mechanism soon.**
> Attendance is pulled *forward* from the broad V2 bucket into a
> near-term follow-on. Once it exists, live sessions may count toward
> completion / engagement. Open: *how* — tutor-marked attendance
> (manual, ships without any integration) vs. integration-pulled
> attendance (Zoom API, part of the managed system). Likely tutor-marked
> first. Design when queued.

---

## Session editor rework

> **▶ CAPTURE (Sam, 2026-06-14): the session editor needs reworking.**

- **The marker editor is fine** — title + week position (+ typical
  duration) is all it needs.
- **The schedule/planner editor must be reworked.** The current single
  `join_url` field is insufficient: real meetings often use a **meeting
  ID + passcode**, not just a click-through link (Zoom in particular;
  Meet/Teams use a bare link). The planner schedule should capture
  richer **connection details**, proposed:
  - **platform** (Zoom / Google Meet / Microsoft Teams / Other)
  - **join URL** (click-to-join link)
  - **meeting ID** (optional)
  - **passcode** (optional)
  - optional free-text **joining instructions** (catch-all: dial-in,
    waiting-room notes, etc.)

  Exact field set finalised at build; the student viewer + tutor Home
  "This week" render from these.

---

## Touch-points (expected — confirm at build)

**Migration:**
- New `nclex_cohort_live_sessions` table (+ RLS scoped to the cohort's
  owning tutor for writes; student-read scoped to enrolled cohort).
- **Gut** `ActivityPayloadOnlineLiveSession` down to the marker
  (drop `scheduled_at`/`join_url`/`recording_url` from the template
  payload; keep/relocate `typical_duration`). Migrate any existing dev
  live-session schedules into planner rows, or accept dev-data reset.

**Server:**
- New planner queries + actions (`lib/cohorts/` — set/clear schedule,
  add one-off → creates cohort-only marker + planner row atomically).
- `getCohortChecklist` — surface the "needs scheduling" state for
  included-but-unscheduled markers.
- `lib/home/tutor/home-queries.ts` `getUpcomingSessions` — read from the
  planner; `HomeSession` gains `cohortId`; re-point the tutor Home "This
  week" link to `/tutor/programme/[id]/cohorts?cohort=&tab=sessions`
  (a TODO already marks the link site).
- `lib/curriculum/student-queries.ts` + viewer — read schedule from the
  planner; "Date TBA" fallback; render as an event (no done pip; not in
  completion denominator).

**UI:**
- The cohort **Sessions** tab (currently a placeholder) becomes the
  planner: list of markers with schedule/unscheduled state, the reworked
  schedule editor, "+ Add session" for one-offs.
- The template marker editor trimmed to title + week (+ typical
  duration).

**Untouched:** the shared-activity bridge (progress / quiz attempts /
library attachments) — small blast radius by design.

---

## Slice breakdown (proposed)

1. **Slice 1 — marker/planner split + schedule.** Migration (new table +
   gut the payload); the cohort Sessions tab lists markers + the reworked
   schedule editor (richer connection fields); student viewer + tutor
   Home read from the planner with "Date TBA" fallback; completion
   exclusion.
2. **Slice 2 — integrity + one-offs.** "Needs scheduling" cue on the
   checklist; "+ Add session" one-off flow (auto-creates the cohort-only
   marker, Option B).
3. **Slice 3 — attendance (near-term follow-on).** Tutor-marked
   attendance first; decide whether/how it feeds completion.
4. **V2 — managed sessions system.** Calendar, reminders, integrations,
   recordings library, attendance via API.

---

## Sibling — pricing is the same pattern (separate, later)

Sam spotted that **price is also per-run data stuck on the template**:
currency on `nclex_programmes.price_currency`, amounts/plans on
`nclex_programme_payment_strategies` (keyed `programme_id`, no
`cohort_id`); **a cohort has no price**. So a tutor can't price two
concurrent cohorts differently or run early-bird/price-rises — a real,
common need. Less urgent (past payments are snapshotted in
`nclex_payments`, so no corruption; sequential intakes work by editing
the programme price between them). Resolve later as a **cohort-level
price override of the programme default** — same philosophy, separate
work. Canonical home:
[payments-and-enrolment.md](payments-and-enrolment.md).

---

## Why NOT full copy-per-cohort (settled 2026-06-06)

Blast-radius scan: `activity_id` is the single shared bridge (progress
keyed `(student, activity_id)`, no cohort_id; quiz attempts via
`programme_activity_id`; library/shelf attachments; all RLS traces
activity → unit → programme → tutor). A full per-cohort copy would mean
rewriting progress + attempt identity + every RLS policy + a deep-copy
engine (none exists), plus new regressions (cross-cohort quiz-history
fragmentation, progress orphaning on re-enrolment). The current model
(one template + thin per-cohort overrides) is the sound "Option B" that
Canvas Blueprint / Thinkific converged on. **Do not switch to copy.**

---

## Related

- [cohort-specific-activities.md](cohort-specific-activities.md) — the
  complementary cohort-only mechanism; the one-off planner flow reuses
  its cohort-only marker rows.
- [curriculum-authoring-ux.md](curriculum-authoring-ux.md) — activity
  types; the cohort checklist that hosts the "needs scheduling" cue.
- [cohort-workspace-fold.md](cohort-workspace-fold.md) — why the planner
  lives on the cohort Sessions tab.
- [payments-and-enrolment.md](payments-and-enrolment.md) — the sibling
  per-cohort pricing override.
