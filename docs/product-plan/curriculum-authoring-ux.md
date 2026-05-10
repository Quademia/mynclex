# MyNclex — Curriculum Authoring UX

*Living document. Part of the `mynclex/docs/product-plan/` set —
see [main.md](main.md) for the overall product plan.*
Last updated: 2026-04-20 (curriculum UX settled)

---

## What this covers

The screens a tutor uses to build and manage the inside of a programme
— from the programmes landing list, through creating a new programme,
laying out weeks, down to authoring individual activities.

Visual mockups for every screen below live at
[mockups/curriculum-authoring-ux.html](mockups/curriculum-authoring-ux.html).
The HTML is reference material from the 2026-04-20 planning session,
not final UI design.

---

## Settled / open status

**Settled 2026-04-20.** Unblocked by the Bank spec being settled the
same day — Mock and Practice quiz editors defer their
question-selection UI to that spec (see [bank.md](bank.md)).

Cross-references into the main plan:

- **Programme definition** (title, length, mode, cohort size, late
  enrolment) — Programme Structure section in [main.md](main.md).
- **Activity block types** — enumerated in Programme Structure
  (v1 = Text / PDF / External link / Practice quiz / Live session /
  Mock; deferred to v2 = uploaded video files, written assignments).
- **Bank-based question selection** — [bank.md](bank.md).

---

## Structure hierarchy

```
Programme  →  Week  →  Module  →  Activity
```

- **Programme** — fixed length in weeks; tutor-owned; cohort or
  rolling mode.
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

### 1. My Programmes (tutor landing list)

- **Single unified list** of owned + co-tutored programmes — not
  split into two sections. Co-tutored rows carry a small tag.
- Each row: title, status pill (Live / Draft), mode (Cohort /
  Rolling), student count, Open button.
- Primary action top-right: **+ New programme**.

### 2. New Programme modal

Triggered by the *+ New programme* button on the My Programmes list.
Renders as a modal (not a dedicated route) — keeps the tutor in
context, allows triggering from other surfaces later. Single-scroll,
three sections: **Identity** / **Schedule** / **Pricing**.

Ten fields:

1. Title *
2. Tagline (one-liner shown on the public card)
3. Description (long copy for the public detail page)
4. Length in weeks *
5. Start date *
6. End date * (auto-fills from start + length × 7; tutor-editable
   to extend bank access beyond the curriculum)
7. Cohort size (optional — blank = no cap)
8. Price (GHS) * (0 = free)
9. Price (USD) * (0 = free)
10. Show price publicly (toggle, default ON; OFF → *"Contact"* button
    on the public detail page instead of *"Pay & enrol"*)

Submit → creates a DRAFT programme → modal closes → parent page
`router.refresh()` → success toast with an optional *Open programme →*
link. Tutor stays on whichever page triggered the modal.

Mode (Cohort / Rolling) and Allow-late-enrolment toggle removed per
the [main.md](main.md) revision (2026-04-20). Status
(DRAFT / PUBLISHED / ARCHIVED / CANCELLED) is set by post-create
actions, not the form.

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

## Key design principles

- **Single unified programmes list.** Owned and co-tutored live in
  the same list with a tag; not split.
- **Flat screens, not wizards.** New Programme is one page, not a
  multi-step flow.
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
  Draft status pill, allowing draft modules inside a Live week.

---

## Decisions not yet settled

- **Drag-and-drop reorder** — deferred to v2.
- **Module unlock semantics** — when a module spans days on the
  calendar, does the module "start" on its earliest activity? To
  confirm in build.
- **Preview mode** — tutor viewing the programme as a student would
  see it. Deferred to build.
- **Clone-programme / clone-week flows** — listed in Programme
  Structure (main.md) as a tutor capability; UI mockup deferred.
- **Multi-tutor edit conflicts** — two co-tutors editing the same
  week simultaneously. Low priority for v1 volumes; revisit if it
  causes issues in pilots.

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
