# Curriculum — Month view (Variant B "Programme schedule")

Status: **PLAN — agreed shape, not yet built** (2026-06-26).
Design: Claude Design "Monthly Curriculum View" prototype
(`Monthly Curriculum View.dc.html`), **concept-not-source**. We build
**Variant B** (the "Programme schedule" frames — week rows × day-groups),
**not** Variant A (the true month grid). Decision rationale below.

## What this is — in one line

A second, **additive** lens on the cohort curriculum: a "Month" toggle
beside the existing view that re-draws the *same activities* on a
time-organised schedule (weeks down, days across). **The existing
two-pane / checklist views are untouched** — this is "switching panes,"
not a rebuild.

## Why it's worth building (the value, honestly)

The current curriculum surfaces organise by **structure** (week →
activity); dates are just fields on each activity. A schedule view adds
the one thing a list can't show: **the shape of time** — clustering,
gaps, collisions.

- **Tutor — "inspect".** A pacing / overload sanity-check: "is week 3
  crammed while week 4 is empty? two mocks in one week? a dead stretch?
  anything unscheduled?" Instantly visible on a timeline; near-invisible
  in a list of date fields. **View-only** — all editing stays in the
  existing view. A chip click *jumps to that activity in the existing
  view* to edit it (spot-on-calendar → fix-in-list).
- **Student — "do".** Not a passive timetable (that would duplicate
  Overview + the week rail). The student chips are **tappable to launch
  the activity** — a by-date study agenda: "it's Wednesday, I have a note
  and a quiz" → tap → you're in it. This is what makes the student view
  pull its weight; without launch it isn't worth building.

**Cohort-only.** The whole thing is driven by real per-cohort dates, so
it only exists in a cohort context. Self-paced programmes have no cohort
timeline → no Month toggle.

## Why Variant B (not the month grid, Variant A)

Counter-intuitively B is **both the better UX here and the smaller
build**:

- Our surfaces already group by **week/unit** (the week rail *is* that
  grouping). B is that same grouping laid out horizontally with
  date-columns — it **reuses the structure** and the per-week progress we
  already compute. A throws the week grouping away and re-buckets by raw
  calendar date.
- An 8-week cohort spans 2–3 calendar months, so A forces **month
  paging** to ever see "the whole plan," and half its cells are empty. B
  shows the entire cohort in one scroll, week-indexed, no paging.
- A needs machinery B doesn't: a Mon-start month matrix (empty / outside-
  month cells), month nav state, and a real **"+N more" overflow**
  interaction. B has none of these.
- B degrades to a phone far better than a 7-column grid (student surfaces
  are phone-first — CLAUDE.md UI #3).

## Feasibility — strong, no migration

- **Tutor data:** the cohort Curriculum tab already loads every template
  activity with its per-cohort `release_date` / due / close + include
  state. The Month view buckets those by date. (Excluded activities are
  shown greyed with an "excl" tag — tutor sees them.)
- **Student data:** `StudentActivity` already carries `releaseDate`,
  `dueDate`, `closeDate`, `openState` (LOCKED/OPEN/CLOSED), `isDone`,
  `isInProgress`, and the block ref. Draft/excluded are already filtered
  server-side.
- **Launch is already factored out.** `lib/curriculum/activity-action.tsx`
  is documented as the shared launcher "reused by ... the weekly +
  **calendar views** later." The student chip tap reuses it verbatim →
  no per-type launch logic to rebuild.
- So both views are a new **layout component + a date-bucketing helper +
  CSS**. No DB work, no new reads.

## Layout spec (faithful to CD Variant B)

A scrollable column inside the curriculum body:

- **Header band:** "Programme schedule" + range + unit count ("Aug 2 →
  Sep 26 · 8 weeks") + a **legend** (Live / Quiz / Mock / Note / Content
  + Excluded[tutor] / Locked·Done[student]).
- **Month bands:** an uppercase "AUG 2027" / "SEP 2027" divider row
  inserted at the first week of each new calendar month.
- **Week rows** (Wk 1 … Wk N — "Mod N" when `unit_label = Module`):
  - Left **label column** (44px): "Wk N". Student also gets a small
    **progress bar** here (reuse the per-unit % the rail already
    computes) + a **left-border state** (done = green / current = accent
    / locked = grey).
  - **Day-groups:** only the days that actually have activities, each a
    small date label ("Mon 2", accented when it's *today*) above its
    stacked **chips**.
- **Chips** (one shared renderer, a verb per audience):
  - Type-coloured left border + icon + truncated title. Colours per CD:
    Live ▶ indigo · Quiz ○ amber · Mock ◈ red · Note ◆ green · Content
    (text/pdf/link) ≡ slate · Shelf ⊞ violet.
  - **Tutor:** block ref tag (B1/B2) · "excl" tag on excluded (greyed,
    strikethrough) · red "due" tag on mocks with a due date. Click →
    jump to that activity in the existing view.
  - **Student:** done = green ✓ · up-next = ↑ tag · amber "due" tag ·
    locked = greyed + **not tappable**. Tap (when OPEN) → launch via
    `<ActivityAction>`; done → review; locked → shows when it opens.

### Undated activities (decided)
An included activity with no real date still belongs to a week, so it
**falls on the first day of its week/module** — the cohort-relative week
start (`cohort_start + (week−1)×7`). Rendered with a subtle "not dated
yet" cue so it reads as unscheduled, not genuinely due that day.

### Toggle + URL state
- A segmented toggle top-right of the curriculum header:
  tutor **"Checklist | Month"**, student **"{Weeks/Modules} | Month"**.
- Selected view rides a URL param (`?cv=month`) so refresh + deep links
  persist, same pattern as `?unit=N`. Absent / `?cv=list` → the existing
  view (unchanged default).

## Slices

**Slice 1 — Tutor Month view (validates the layout).**
- New shared layout + chip renderer + date→week-bucketing helper (files
  in `lib/curriculum/`, no new folder; styles in
  `styles/curriculum-month.css`).
- Toggle on the cohort Curriculum tab; `?cv=` state. Build from the
  tutor data already loaded there (included + excluded, block refs).
- Chip click → switch to the existing view at that activity's week.
- Mobile reflow.
- *Why first: proves the calendar layout cheaply with no launch logic.*

**Slice 2 — Student Month view (reuses the layout, adds the verbs).**
- Reuse Slice 1's layout + chip renderer.
- Student chip states (done ✓ / up-next ↑ / due / locked) + **tap-to-
  launch via `<ActivityAction>`** (the documented reuse); locked not
  tappable.
- Per-week progress bar + row border state (reuse the rail's per-unit %).
- Toggle "Weeks | Month" on the student cohort curriculum page; `?cv=`.
- Month bands + mobile stack.

## Open items / deferred
- Tutor chip-click target: v1 = switch to the existing view scrolled to
  the week (simplest). A deep anchor to the exact activity row is a
  follow-on if wanted.
- No editing on the calendar (no drag-to-reschedule, no add-on-day) —
  out of scope by decision; editing stays in the existing view.
- Variant A (month grid) not built; revisit only if the schedule view
  proves it needs a calendar-month metaphor.
