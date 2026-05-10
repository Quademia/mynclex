# MyNclex — Curriculum Authoring UX

*Living document. Part of the `mynclex/docs/product-plan/` set —
see [main.md](main.md) for the overall product plan.*
Last updated: 2026-05-10 (programme/cohort split — curriculum lives at programme layer; new Cohort Management section added; New Programme modal redesigned to capture programme + first cohort)

---

## What this covers

The screens a tutor uses to build and manage the inside of a
programme — from the programmes landing list, through creating a
programme, laying out weeks, down to authoring individual activities
— and the screens for managing *cohorts* (specific runs) of that
programme.

Visual mockups for every screen below live at
[mockups/curriculum-authoring-ux.html](mockups/curriculum-authoring-ux.html).
The HTML is reference material, not final UI design.

---

## Settled / open status

- **Curriculum authoring** — settled 2026-04-20.
- **Programme/cohort split** — settled 2026-05-10. Curriculum lives
  at the programme layer; cohort management is a separate set of
  screens (see Cohort Management below).

Cross-references into the main plan:

- **Programme definition + cohort lifecycle + propagation rules** —
  Programme Structure section in [main.md](main.md).
- **Activity block types** — enumerated in Programme Structure
  (v1 = Text / PDF / External link / Practice quiz / Live session /
  Mock; deferred to v2 = uploaded video files, written assignments,
  Library Note).
- **Bank-based question selection** — [bank.md](bank.md).

---

## Two-layer model (recap)

This doc covers screens at both layers, because the tutor moves
between them constantly.

- **Programme layer** — the *reusable design*. Title, tagline,
  description, length in weeks, pricing, and the curriculum (weeks →
  modules → activities). Screens 1–7 below.
- **Cohort layer** — a *specific run*. Dates, seats, enrolment,
  schedule, and the checklist of which template activities are in
  this cohort. Screens 8–11 below.

**Propagation principle.** Curriculum content edits propagate to
every live cohort automatically. Structural changes (adding an
activity to the template, removing one, reordering) do not
propagate — the tutor opts in per cohort. A cohort can also add
cohort-only activities that don't exist in the template at all.
See *Programme Structure → Curriculum propagation* in
[main.md](main.md) for the full rules.

---

## Structure hierarchy

```
Programme  →  Week  →  Module  →  Activity
```

- **Programme** — fixed length in weeks; tutor-owned; reusable
  across cohorts.
- **Week** — one row of the tutor's plan; pre-slotted for all N
  weeks (empty weeks shown as dashed placeholders, so the tutor
  always sees the full programme shape).
- **Module** — groups related activities within a week
  (e.g. a "Cardiac anatomy primer" module containing reading, a
  video, and a practice quiz). Modules are a real structural layer,
  not just visual section headers — they matter for the calendar
  view (see below).
- **Activity** — a single content or assessment unit. Six types in
  v1: Text, PDF, External link, Practice quiz, Live session, Mock.

---

## Screens

### Programme layer (screens 1–7)

These screens design the *reusable* programme — its identity,
pricing, and curriculum. They look the same regardless of how many
cohorts are running.

### 1. My Programmes (tutor landing list)

- **Single unified list** of owned + co-tutored programmes — not
  split into two sections. Co-tutored rows carry a small tag.
- Each row: title, status pill (Draft / Published / Archived),
  cohort count line ("2 cohorts running · 1 upcoming · 5 ended"),
  Open button.
- Primary action top-right: **+ New programme**.

Mode (Cohort / Rolling) is gone — every programme has one or more
cohorts now, the distinction collapsed. Student count is no longer
shown here because students enrol in cohorts, not programmes; the
per-cohort student count lives on the cohort row inside the
programme (see Cohort Management).

### 2. New Programme modal

Triggered by the *+ New programme* button on the My Programmes list.
Renders as a modal — keeps the tutor in context, allows triggering
from other surfaces later. Single-scroll, four sections:
**Identity** / **Pricing** / **First cohort** / *(submit)*.

The modal captures the programme *and* its first cohort in one go.
The first cohort is the most common reason a tutor creates a
programme — making them go through "create programme, then create
cohort" as two separate steps is two clicks for one mental
action. Subsequent cohorts of the same programme use a smaller
"+ New cohort" modal (see screen 9).

**Programme fields (Identity + Pricing):**

1. Title *
2. Tagline (one-liner shown on the public card)
3. Description (long copy for the public detail page)
4. Length in weeks *
5. Price (GHS) * (0 = free)
6. Price (USD) * (0 = free)
7. Show price publicly (toggle, default ON; OFF → *"Contact"* button
   on the public detail page instead of *"Pay & enrol"*)

**First-cohort fields:**

8. Cohort name (optional; auto-generates from dates if left blank)
9. Start date *
10. End date * (auto-fills from start + length × 7; tutor-editable
    to extend bank access beyond the curriculum)
11. Cohort size (optional — blank = no cap)
12. Allow late join (toggle, default OFF)

Submit → creates a DRAFT programme + UPCOMING cohort in one atomic
write → modal closes → parent page `router.refresh()` → success
toast with an optional *Open programme →* link. Tutor stays on
whichever page triggered the modal.

**Programme status** (`DRAFT / PUBLISHED / ARCHIVED`) and **cohort
status** (`UPCOMING / IN_PROGRESS / ENDED / CANCELLED`) are both
set by post-create actions, not the form. A freshly created
programme starts DRAFT and a freshly created cohort starts UPCOMING.

### 3. Weeks Overview — two views

Segmented toggle top-right: **Weeks** / **Calendar**. Same programme
data, two projections.

#### Week view (default)

- Grid of week cards. N cards for an N-week programme.
- Empty weeks shown **dashed** so the tutor always sees the full
  shape — no "add week 4" button; week 4 is already there,
  just empty.
- Each card shows: week number, status pill, title, meta (date
  range, module count).

#### Calendar view

- Rows = weeks, columns = days (Mon–Sun).
- Shows **scheduled activities only** — Live session, Practice
  quiz, Mock. Text / PDF / External link are "anytime" work and
  deliberately don't appear here.
- Each chip carries its module reference (e.g. "M2") so the tutor
  can see a module thread across days (a single module can span
  Mon intro → Wed workshop → Thu practice → Sun mock).
- Legend + "Text, PDF, link activities are anytime — not shown"
  hint at the top.

### 4. Week Builder

Inside one week:

- **Header card** — week number, status, title, meta (unlock day,
  module count, activity count), **Edit week** button.
- **Module cards** — each a card containing a flat list of
  activity rows. Module head carries its own status pill and
  Edit / Delete actions, plus up/down arrows to move the whole
  module within the week.
- **Activity row** — type icon, title, one-line meta (type ·
  duration / size / count), up/down arrows for within-module
  reorder.
- Each module has its own **+ Add activity** (dashed inline
  button).
- **Full-width "+ Add module"** prominent dashed button at the
  bottom of the week.

#### Reorder model

- **Up/down arrows** on activity rows (within a module) and on
  module cards (within a week).
- **Drag-and-drop deferred to v2.** Arrows are lower friction to
  build, sufficient for v1 cohort sizes.

### 5. Add-activity inline picker

When the tutor clicks **+ Add activity** inside a module, the button
is replaced **in place** by a 3×2 picker of the six activity types.
Each option is a tile with icon, name, and a one-line description
(e.g. "Text content — Notes & reading"). After selection:

1. The picker closes.
2. The editor panel slides in from the right.

This avoids a modal-heavy feel and keeps the tutor's context (the
week they were editing) visible.

### 6. Activity editors — six types

All editors share the same shape:

```
[ Type label ]                              [ Cancel ]  [ Save ]
Title *
Note to student
{ type-specific fields }
```

**Type-specific fields:**

| Type | Fields |
|---|---|
| **Text content** | Rich-text editor (H2, H3, B, I, lists, link, image, quote) + estimated reading time |
| **PDF upload** | File tile (upload / replace) + estimated time |
| **External link** | URL (YouTube/Vimeo get inline preview; other links open in new tab) + estimated time |
| **Live session** | Date, time, duration + Join link (Zoom / Meet) + Recording URL (added after the session; dashed placeholder until then) |
| **Mock assessment** | Count, Time limit, Pass score + Due date, Attempts + Release results (Immediately / After due date). Question-selection UI deferred to bank spec. |
| **Practice quiz** | Count + Due date (optional), Pass score (optional) + Release results. Question-selection UI deferred to bank spec. |

Mock and Practice quiz editors show a notice in the mockups flagging
the question-selection placeholder ("Questions — from the bank. UI
designed with the bank topic.") — with the bank now settled, that
placeholder resolves to the student/tutor filter builder described
in bank.md.

---

### Cohort layer (screens 8–11)

These screens manage *specific runs* of a programme. They live on
a Cohorts tab inside the programme workspace and don't change the
underlying curriculum — they configure delivery state and membership.

### 7. Programme home — tabs

When the tutor opens a programme, the workspace presents a tabbed
view with the following tabs:

- **Curriculum** — the programme-layer curriculum editor (Weeks /
  Calendar views from screens 3–5). Default tab.
- **Cohorts** — list of cohorts (screen 8 below).
- **Students** — aggregated roster across all cohorts of this
  programme (placeholder until enrolment ships).
- **Analytics** — aggregated outcomes across cohorts (placeholder
  until results ships).
- **Settings** — programme identity (title, tagline, description),
  pricing, archive / publish controls.

### 8. Cohorts tab — list

Inside a programme. Lists every cohort that's ever been launched
for this programme.

- Each row: cohort name (auto or override), date range
  (*"5 Jan – 27 Mar 2027"*), status pill (Upcoming / In progress /
  Ended / Cancelled), enrolment count (*"7 / 20"* or *"7 students"*
  if uncapped), actions (Open / Archive / Duplicate).
- Active rows (Upcoming + In progress) appear at the top; Ended /
  Cancelled collapse behind a *Show past cohorts (N)* toggle (same
  pattern as the History page and the *Show archived* toggle on
  My Programmes).
- Primary action top-right: **+ New cohort**.

### 9. New Cohort modal

Smaller modal than New Programme — only the cohort-level fields,
because everything else is inherited from the programme.

Five fields:

1. Cohort name (optional; auto-generates from dates if blank)
2. Start date *
3. End date * (auto-fills from start + length × 7)
4. Cohort size (optional — blank = no cap)
5. Allow late join (toggle, default OFF)

Submit → creates an UPCOMING cohort → modal closes →
`router.refresh()` → success toast linking to the new cohort.

### 10. Cohort detail — overview

Opening a cohort from the Cohorts list. Cohort-scoped workspace
with its own sub-nav:

- **Overview** — date range, status, enrolled-students count, next
  live session, recent announcements. Default tab.
- **Curriculum** — the cohort's *checklist* (see screen 11).
- **Students** — roster of students enrolled in this cohort.
- **Sessions** — live session schedule for this cohort with join
  links + recordings.
- **Announcements** — post messages to this cohort's students.
- **Settings** — cohort name, dates, size, late-join toggle,
  archive / cancel.

This is the day-to-day workspace for running a cohort. The
programme-layer curriculum editor stays one click away (back to
the programme's Curriculum tab).

### 11. Cohort curriculum — checklist view

Inside a cohort. Shows the same week → module → activity hierarchy
as the programme-layer Week Builder, but each row is a *checklist
entry* pointing at a template activity (or a cohort-only entry)
with cohort-specific release state.

- Same visual shape as the Week Builder (screen 5): week cards →
  module cards → activity rows.
- Each activity row carries a small pill indicating its source:
  *"Template"* (default; reads content from the programme) or
  *"Cohort-only"* (content lives on this row, doesn't propagate).
- Row actions per activity: **Remove from this cohort** (deletes
  the checklist entry, doesn't touch the template), **Edit
  release date** (per-cohort scheduling).
- Each module has a **+ Add from template** action — shows any
  template activities not currently in this cohort, tutor can
  add them back if previously removed or newly added to the
  template after cohort launch.
- Each module also has a **+ Add cohort-only activity** action —
  opens the same 3×2 activity picker as the programme-layer
  Week Builder, but the result lives only in this cohort.
- A small notice line at the top: *"Content edits live at the
  programme. Edit the curriculum →"* with a link back to the
  programme-layer editor. Reinforces the propagation rule (typo
  fixes go in the template, not here).

#### Per-cohort release scheduling

Each cohort activity has a release date defaulted from the
cohort's start_date + the activity's week number. Tutor can
override per-cohort (e.g. push a quiz back a week for this
specific intake). Editing the release date doesn't touch the
template — purely cohort-level.

---

## Key design principles

- **Programme is the reusable design; cohort is the run.**
  Curriculum lives at the programme — edit once, apply forward to
  every cohort. Cohort owns dates, seats, enrolment, schedule,
  and the checklist of which template activities are in.
- **Content propagates; structure doesn't.** Edits to programme
  curriculum content (titles, text, video links, quiz keys) flow
  to every live cohort automatically. Adding, removing, or
  reordering activities at the programme layer does *not* flow —
  the tutor opts in per cohort.
- **Cohort-only adds are a real escape valve.** A cohort can hold
  activities that don't exist in the template (a one-off workshop,
  an extra mock). They stay cohort-scoped and don't pollute the
  template.
- **Single unified programmes list.** Owned and co-tutored live in
  the same list with a tag; not split.
- **First-cohort capture in the create modal.** The New Programme
  modal captures programme + first cohort in one go. Subsequent
  cohorts use a smaller modal. Most programmes start with one
  cohort; making that the natural flow.
- **Flat screens, not wizards.** New Programme and New Cohort are
  each one page, not multi-step flows.
- **Empty-week scaffolding.** The tutor always sees N week cards
  from day one — structure is visible even before content is added.
- **Two projections of the same data** (Weeks vs Calendar) — same
  content, different lens. Calendar intentionally shows only
  scheduled activities.
- **Modules are a real layer** (not just headings). They cluster
  related activities visually and thread across days on the
  calendar.
- **In-place inline picker** for adding activities — avoids modals;
  keeps the week visible.
- **Up/down arrow reorder** is the v1 model for both activities
  within a module and modules within a week.
- **Dual publish status** — both module and week carry a Live /
  Draft status pill at the programme layer, allowing draft modules
  inside a Live week.

---

## Decisions not yet settled

- **Drag-and-drop reorder** — deferred to v2.
- **Module unlock semantics** — when a module spans days on the
  calendar, does the module "start" on its earliest activity? To
  confirm in build.
- **Preview mode** — tutor viewing a cohort as a student would
  see it. Deferred to build.
- **Duplicate-programme / duplicate-cohort flows** — listed in
  Programme Structure (main.md) as tutor capabilities; UI mockup
  deferred.
- **Multi-tutor edit conflicts** — two co-tutors editing the same
  week simultaneously. Low priority for v1 volumes; revisit if it
  causes issues in pilots.
- **Cohort-only content overrides** — explicitly *not* in v1. A
  cohort can add or remove activities but cannot edit the body of
  a template activity for itself only. Revisit if real tutor
  demand surfaces.

---

## Related

- [main.md](main.md) — overall product plan (Programme Structure
  covers programme definitions, cohort model, block types, tutor
  actions).
- [bank.md](bank.md) — question bank, source of the
  question-selection UI used by Mock and Practice quiz editors.
- [tutor-library.md](tutor-library.md) — parked feature; will add
  Library Note as the 7th activity type (and a 7th editor in the
  table above) when queued for build.
- [mockups/curriculum-authoring-ux.html](mockups/curriculum-authoring-ux.html)
  — visual mockups from the 2026-04-20 session.
