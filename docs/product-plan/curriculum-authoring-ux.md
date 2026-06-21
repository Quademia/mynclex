# MyNclex — Curriculum Authoring UX

*Living document. Part of the `mynclex/docs/product-plan/` set —
see [main.md](main.md) for the overall product plan.*
Last updated: 2026-05-11 (curriculum architecture rework — modules renamed to **blocks** with new semantics; weeks abstracted to a generic **units** layer; activities can live loose under a unit OR inside a block; **delivery modes** introduced — tutor-led vs self-paced — **both ship in v1**; **unit label is an independent tutor choice** (Week / Module), decoupled from delivery mode, with smart defaults. Structure hierarchy + New Programme modal + Unit Builder + Activity-picker entry points all rewritten. Programme/cohort split from 2026-05-10 retained.)

---

## What this covers

The screens a tutor uses to build and manage the inside of a
programme — from the programmes landing list, through creating a
programme (tutor-led or self-paced; both ship in v1), laying out
units (labelled Weeks or Modules per the programme's `unit_label`),
down to authoring individual activities — and, for tutor-led
programmes, the screens for managing *cohorts* (specific runs).

Visual mockups for every screen below live at
[mockups/curriculum-authoring-ux.html](mockups/curriculum-authoring-ux.html).
The HTML is reference material, not final UI design.

---

## Settled / open status

- **Curriculum authoring** — settled 2026-04-20.
- **Programme/cohort split** — settled 2026-05-10. Curriculum lives
  at the programme layer; cohort management is a separate set of
  screens (see Cohort Management below).
- **Curriculum architecture rework** — settled 2026-05-11. Modules
  renamed to **blocks** with new semantics (workflow groupings, not
  academic chapters); weeks abstracted to a generic **units** layer;
  activities can live loose under a unit OR inside a block; delivery
  modes (tutor-led vs self-paced) introduced — **both ship in v1**;
  unit label (Week / Module) is a separate tutor choice on the
  programme, decoupled from delivery mode, with smart defaults.

Cross-references into the main plan:

- **Programme definition + cohort lifecycle + propagation rules +
  delivery modes** — Programme Structure section in
  [main.md](main.md).
- **Activity types** — enumerated in Programme Structure
  (v1 = Text / PDF / External link / Practice quiz / Live session /
  Mock / **Library Note** / **Library Shelf** — the last two BUILT in
  2026-06 as the 7th + 8th types, slices 11.11 / 11.12; deferred to v2
  = uploaded video files, written assignments).
- **Bank-based question selection** — [bank.md](bank.md).

---

## Delivery model (recap)

v1 ships **both tutor-led and self-paced** programmes. Every
programme is one mode or the other.

**Tutor-led** has two layers. The tutor moves between them
constantly:

- **Programme layer** — the *reusable design*. Delivery mode, unit
  label, title, tagline, description, length in units, pricing, and
  the curriculum (units → blocks → activities, with blocks
  optional). Screens 1–7 below.
- **Cohort layer** — a *specific run*. Dates, seats, enrolment,
  schedule, and the checklist of which template activities are in
  this cohort. Screens 8–11 below.

**Self-paced** has just the programme layer — no cohorts. Students
enrol directly in the programme; activities gate by `is_published`
+ student progression rather than cohort release dates. The
programme-layer screens (1–7) carry over almost unchanged. The
deltas:

- *New Programme modal* drops the *First cohort* section (no
  cohort to seed at create-time).
- *Units Overview* hides the Calendar segmented option (no cohort
  calendar to project against).
- *Cohorts tab* + screens 8–11 don't appear in the workspace.
- A new screen 12 covers the **self-paced enrolment flow** —
  students click *Enrol*, pick an access window, pay, and land on
  unit 1. Drafted at the bottom of this doc.

The unit label ("Week" or "Module") is a programme-level choice,
not a mode-derived label — see *Unit label* in [main.md](main.md).
Smart default is Week for tutor-led and Module for self-paced;
tutor can override either way.

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
Programme  →  Unit  →  Block (optional)  →  Activity
```

- **Programme** — fixed length in units; tutor-owned; reusable
  across cohorts (tutor-led mode).
- **Unit** — top-level pacing/grouping container; one row of the
  tutor's plan; pre-slotted for all N units (empty units shown as
  dashed placeholders so the tutor always sees the full programme
  shape). Rendered as **Week N** or **Module N** per the
  programme's `unit_label` (a separate tutor choice on the
  programme; defaults to Week for tutor-led and Module for self-
  paced, but the tutor can override either way). Same layer in the
  database — only the rendered label changes. (The label switch is
  a one-line change in copy; everything else about the screens
  stays identical.)
- **Block** *(optional)* — a guided workflow grouping of related
  activities the student treats as one push. Common shapes: a
  tutorial-anchored block (pre-tutorial reading + the live tutorial
  + a post-tutorial quiz, all wrapped together); or an asynchronous
  sequence like PDF → practice quiz → revision drill. A live session
  is a *common* anchor but not a requirement — a block can be
  entirely asynchronous.
- **Activity** — a single actionable learning item. Six types in
  v1: Text, PDF, External link, Practice quiz, Live session, Mock.

### Loose vs. blocked activities

A unit can contain **loose activities** (no block parent) AND
**block cards** (each block holding its own activities) in any
mix. The tutor's decision rule, applied per group of activities:

- *"Do I want the student to treat these as one push?"* → block.
- *"Is this just a thing for this unit?"* → loose.

This avoids fake single-activity blocks (which would dilute what a
block means). A unit can be entirely flat (all loose), entirely
blocked (every activity in a block), or a mix. A block must
contain at least one activity — empty blocks aren't allowed.

Schema implication: `activity.unit_id` is required;
`activity.block_id` is nullable. `block_id IS NULL` means the
activity is loose under its unit.

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
from other surfaces later. Single-scroll, with sections that vary
slightly by delivery mode: **Identity** / **Pricing** / **First
cohort** *(tutor-led only)* / *(submit)*.

The modal captures the programme *and* (in tutor-led mode) its
first cohort in one go. The first cohort is the most common reason
a tutor creates a programme — making them go through "create
programme, then create cohort" as two separate steps is two clicks
for one mental action. Subsequent cohorts use a smaller "+ New
cohort" modal (see screen 9). Self-paced programmes (when shipped)
have no cohort layer at all, so the *First cohort* section
disappears for that mode.

**Delivery mode picker** (top of Identity section, segmented
control — both options live in v1):

- **Tutor-led** *(default)* — programme has cohorts; the modal
  shows a *First cohort* section below.
- **Self-paced** — no cohorts; the modal hides the *First cohort*
  section.

The mode is set at create-time only; changing it after the
programme exists is not supported in v1 (the implications for
cohorts, enrolments, and release dates are too large).

**Unit label picker** (right after the delivery-mode picker,
segmented control):

- **Week** — the unit will render as "Week 1", "Week 2", … on
  every UI surface.
- **Module** — the unit will render as "Module 1", "Module 2", …

**Smart default**: picking Tutor-led pre-selects Week; picking
Self-paced pre-selects Module. Tutor can override either way before
submitting (e.g. a topic-organised tutor-led programme may pick
Module, or a self-paced programme with a suggested weekly pacing
plan may pick Week). Editable later from programme settings — it's
a label flip, no data migration.

**Programme fields (Identity + Pricing):**

1. Title *
2. Tagline (one-liner shown on the public card)
3. Description (long copy for the public detail page)
4. Length (units) * — form label flips with the unit-label picker:
   "Length in weeks" or "Number of modules". Stored as a unit count.
5. Price (GHS) * (0 = free)
6. Price (USD) * (0 = free)
7. Show price publicly (toggle, default ON; OFF → *"Contact"* button
   on the public detail page instead of *"Pay & enrol"*)

**First-cohort fields** *(tutor-led mode only — section hidden when
Self-paced is selected)*:

8. Cohort name (optional; auto-generates from dates if left blank)
9. Start date *
10. End date * (auto-fills from start + length × 7; tutor-editable
    to extend bank access beyond the curriculum)
11. Cohort size (optional — blank = no cap)
12. Allow late join (toggle, default OFF)

Submit → creates a DRAFT programme (+ UPCOMING cohort in tutor-led
mode) in one atomic write → modal closes → parent page
`router.refresh()` → success toast with an optional *Open programme
→* link. Tutor stays on whichever page triggered the modal.

**Programme status** (`DRAFT / PUBLISHED / ARCHIVED`) and **cohort
status** (`UPCOMING / IN_PROGRESS / ENDED / CANCELLED`) are both
set by post-create actions, not the form. A freshly created
programme starts DRAFT and a freshly created cohort starts UPCOMING.

### 3. Units Overview — two views

Segmented toggle top-right: **Units** / **Calendar** (the Calendar
option is hidden in self-paced mode — there's no cohort calendar to
project against). UI labels for the segmented control use *Weeks*
or *Modules* per the programme's `unit_label`; this doc says
"Units" for the abstract layer and "Weeks/Modules" only where the
label is what the tutor sees.

#### Unit view (default)

- Grid of unit cards. N cards for an N-unit programme.
- Empty units shown **dashed** so the tutor always sees the full
  shape — no "add unit 4" button; unit 4 is already there, just
  empty.
- Each card shows: unit number, status pill, title, meta (date
  range *(tutor-led only — derived from the cohort's start date in
  the per-cohort checklist; the programme-layer view shows
  "Unit N" without dates)*, block count, loose-activity count).
- UI label per the programme's `unit_label`: "Week 1", "Week 2", …
  if Week; "Module 1", "Module 2", … if Module. Independent of
  delivery mode.

#### Calendar view *(tutor-led mode only)*

- Rows = units (weeks), columns = days (Mon–Sun).
- Shows **scheduled activities only** — Live session, Practice
  quiz, Mock. Text / PDF / External link are "anytime" work and
  deliberately don't appear here.
- Each chip carries its block reference (e.g. "B2") when the
  activity belongs to a block, so the tutor can see a block thread
  across days (a single block can span Mon pre-reading → Wed
  tutorial → Thu practice → Sun mock). Loose activities show
  without a block reference.
- Legend + "Text, PDF, link activities are anytime — not shown"
  hint at the top.

### 4. Unit Builder

Inside one unit. A unit's body is a vertical stack of two kinds of
entries, interleavable in any order:

- **Block cards** — each a card holding the block's title, optional
  description, status pill, and the activities inside it.
- **Loose activity rows** — sit directly in the unit's body, not
  inside any block card.

Structure:

- **Header card** — unit number (label per mode), status, title,
  meta (unlock day *(tutor-led only)*, block count, total activity
  count), **Edit unit** button.
- **Body** — interleaved block cards + loose activity rows in the
  tutor's chosen order. Each entry carries up/down arrows for
  reorder within the unit.
- **Block card internals** — block head (title, status pill, Edit
  / Delete, up/down arrows for moving the whole block within the
  unit), then a flat list of activity rows. Each block has its
  own **+ Add activity to block** dashed button.
- **Activity row (loose or in-block)** — type icon, title, one-line
  meta (type · duration / size / count), up/down arrows for
  reorder.
- **Two full-width entry points at the bottom of the unit:**
  - **+ Add activity** — creates a loose activity directly under
    the unit.
  - **+ Add block** — creates a new (empty) block card and prompts
    for a title; the tutor then adds activities into it. A block
    must contain at least one activity before the unit can be
    published — empty blocks render with a "1 activity needed"
    affordance.

#### Reorder model

- **Up/down arrows** at every level: activities within a block,
  activities loose under a unit, block cards within a unit, and
  loose-activity rows sitting between block cards (i.e. the unit
  body's vertical order is a single sequence of mixed entries).
- A loose activity can be **promoted into a block** (drag-and-arrow
  not needed in v1; provide a row action "Move into block →"
  with a dropdown of existing blocks in this unit, or "+ New
  block" to wrap the activity in a fresh block).
- A block's last activity, when removed, prompts the tutor:
  *"This is the last activity in this block — delete the block too,
  or move the activity out as a loose activity?"* (avoids leaving
  empty block shells.)
- **Drag-and-drop deferred to v2.** Arrows are lower friction to
  build, sufficient for v1 cohort sizes.

### 5. Add-activity inline picker

When the tutor clicks **+ Add activity** at the unit level (loose)
OR **+ Add activity to block** inside a block card, the button is
replaced **in place** by a 3×2 picker of the six activity types.
Each option is a tile with icon, name, and a one-line description
(e.g. "Text content — Notes & reading"). After selection:

1. The picker closes.
2. The editor panel slides in from the right.
3. On Save, the activity attaches as loose (`block_id = null`) or
   to the block whose picker invoked it, depending on entry point.

This avoids a modal-heavy feel and keeps the tutor's context (the
unit they were editing) visible. Same picker for both entry points;
only the parent context differs.

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

- **Curriculum** — the programme-layer curriculum editor (Units /
  Calendar views from screens 3–5). Default tab.
- **Cohorts** — list of cohorts *(tutor-led only — hidden in
  self-paced programmes)* (screen 8 below).
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

> **▶ BUILD UPDATE 2026-06-01 — the checklist is now a LIVE three-state
> model (this supersedes the snapshot + "add from template" design
> described in the rest of this section).** Decided with Sam after the
> original snapshot model proved to have a sync problem: activities
> added to the programme after a cohort was created never reached the
> cohort (no checklist row was seeded for them), so they were invisible
> in the cohort checklist *and* to students.
>
> **New model:** the checklist is the **live programme template** — every
> current activity always renders. A checklist row
> (`nclex_cohort_checklist_items`) is now only an **override**, created
> on the tutor's first explicit decision. Each activity is one of:
> - **Unconfigured** — no row yet. Renders with computed defaults
>   (included-shaped but **hidden from students** until decided; the
>   default release date shows faint). Counted in a header "N
>   unconfigured · Include all" prompt.
> - **Included** — override row, `is_included = true`.
> - **Excluded** — override row, `is_included = false`.
>
> The row carries an explicit **`✓ Include` / `✗ Exclude`** segment
> (neither active = unconfigured). Date/inclusion edits are
> `(cohort_id, activity_id)` **upserts** — the row is born on first
> touch; `release_date` defaults to the week-pacing below. **Completion
> for Library-Note / Shelf activities is derived from
> `nclex_library_note_state`, never the progress engine.** The
> seed-on-cohort-creation trigger is **dropped** (migration
> `20260625130000`); existing cohorts keep their prior rows; new cohorts
> start all-unconfigured and the tutor uses **Include all**. Student
> side is unchanged — it already reads included rows only, so
> unconfigured/excluded are naturally hidden. The "Remove from this
> cohort" / "+ Add from template" affordances below are **not built**.
>
> **▶ Cohort-only activities — DESIGN AGREED 2026-06-14 (not yet
> built).** The "+ Add cohort-only" escape valve is now fully designed:
> cohort-only activities + blocks are ordinary `nclex_programme_*` rows
> tagged with a `cohort_id` (Option A), born *included* and *Draft*
> (a nudge reminds the tutor to tick Live), supported for 7 of the 8
> activity types (live session excluded → its own planner), added on
> this very screen (the cohort Curriculum tab). Full design + slice
> breakdown in
> [cohort-specific-activities.md](cohort-specific-activities.md). The
> `source = 'COHORT_ONLY'` enum scaffolding already exists in
> `lib/cohorts/types.ts`.

Inside a cohort. Shows the same unit → block → activity hierarchy
as the programme-layer Unit Builder, but each row is a *checklist
entry* pointing at a template activity (or a cohort-only entry)
with cohort-specific release state.

- Same visual shape as the Unit Builder (screen 4): unit cards →
  interleaved block cards + loose activity rows.
- Each activity row carries a small pill indicating its source:
  *"Template"* (default; reads content from the programme) or
  *"Cohort-only"* (content lives on this row, doesn't propagate).
- Block cards inherit their template/cohort-only status from
  their content: a block carries the *Template* pill if it
  originated in the programme, *Cohort-only* if added in this
  cohort.
- Row actions per activity: **Remove from this cohort** (deletes
  the checklist entry, doesn't touch the template), **Edit
  release date** (per-cohort scheduling).
- Each unit has a **+ Add from template** action — shows any
  template activities/blocks not currently in this cohort; tutor
  can add them back if previously removed or newly added to the
  template after cohort launch.
- Each unit also has **+ Add cohort-only activity** and **+ Add
  cohort-only block** actions, mirroring the two entry points on
  the programme-layer Unit Builder. The result lives only in this
  cohort.
- A small notice line at the top: *"Content edits live at the
  programme. Edit the curriculum →"* with a link back to the
  programme-layer editor. Reinforces the propagation rule (typo
  fixes go in the template, not here).

#### Per-cohort release scheduling

Each cohort activity has a release date defaulted from the
cohort's start_date + the activity's unit index (one unit = one
week of calendar by default — independent of the programme's
unit_label). Tutor can override per-cohort (e.g. push a quiz back
a week for this specific intake). Editing the release date doesn't
touch the template — purely cohort-level. *(Self-paced programmes
have no cohorts and therefore no release dates — see
[main.md](main.md) → Content visibility.)*

---

### Self-paced surface (screen 12+) — drafted, design pending

Self-paced programmes share screens 1–7 above and skip 8–11. They
also need a small set of new surfaces queued for the self-paced
build slice:

- **Public detail page → enrol flow** (the self-paced equivalent
  of the cohort-pick step on the tutor-led detail page). Student
  picks the access window, pays, lands on unit 1.
- **Student programme home** — direct-enrol equivalent of the
  cohort dashboard. Programme-scoped, no cohort switcher, no
  next-live-session card. See *Student dashboard → Self-paced
  dashboard* in [main.md](main.md).
- **Tutor view of enrolled students** — same as tutor-led's
  cohort-students screen but cohort-less; lists every enrolled
  self-paced student with their progress + access-window expiry.

Full mockups deferred until the slice is queued. The shape is
intentionally close to the tutor-led equivalents — most components
will reuse with a `delivery_mode` prop or context.

---

## Key design principles

- **Programme is the reusable design; cohort is the run.**
  Curriculum lives at the programme — edit once, apply forward to
  every cohort. Cohort owns dates, seats, enrolment, schedule,
  and the checklist of which template activities are in.
- **One curriculum engine, two delivery modes — both v1.** Tutor-led
  and self-paced programmes share the same Programme → Unit →
  Block → Activity layers. The mode-difference is the
  presence/absence of the cohort layer and whether release dates
  exist. The programme-layer editor screens carry over almost
  unchanged across modes.
- **Unit label is decoupled from delivery mode.** A separate tutor
  choice on the programme — Week or Module. Smart default
  (Tutor-led → Week; Self-paced → Module) handles the common case;
  override is one click for unusual programmes (topic-organised
  tutor-led; self-paced with a weekly pacing plan).
- **Content propagates; structure doesn't.** Edits to programme
  curriculum content (titles, text, video links, quiz keys) flow
  to every live cohort automatically. Adding, removing, or
  reordering activities at the programme layer does *not* flow —
  the tutor opts in per cohort.
- **Cohort-only adds are a real escape valve.** A cohort can hold
  activities (and blocks) that don't exist in the template (a
  one-off workshop, an extra mock). They stay cohort-scoped and
  don't pollute the template.
- **Single unified programmes list.** Owned and co-tutored live in
  the same list with a tag; not split.
- **First-cohort capture in the create modal.** In tutor-led mode,
  the New Programme modal captures programme + first cohort in one
  go. Subsequent cohorts use a smaller modal. Most programmes start
  with one cohort; making that the natural flow.
- **Flat screens, not wizards.** New Programme and New Cohort are
  each one page, not multi-step flows.
- **Empty-unit scaffolding.** The tutor always sees N unit cards
  from day one — structure is visible even before content is added.
- **Two projections of the same data** (Units vs Calendar) — same
  content, different lens. Calendar intentionally shows only
  scheduled activities.
- **Blocks are an optional grouping layer.** Activities can sit
  loose under a unit OR be wrapped in a block. Blocks exist when
  the tutor wants the student to treat several activities as one
  workflow push. Empty blocks aren't allowed; fake single-activity
  blocks are discouraged. Blocks thread across days on the calendar
  view (same role modules used to play).
- **Two entry points on the Unit Builder:** "+ Add activity" (loose)
  and "+ Add block" (group). Symmetric inside a block: "+ Add
  activity to block".
- **In-place inline picker** for adding activities — avoids modals;
  keeps the unit visible. Same picker for both loose and in-block
  entry points.
- **Up/down arrow reorder** is the v1 model at every level:
  activities within a block, activities loose under a unit, blocks
  within a unit, and the interleaved unit body.
- **Dual publish status** — block and unit each carry a Live /
  Draft status pill at the programme layer, allowing draft blocks
  inside a Live unit.

---

## Decisions not yet settled

- **Drag-and-drop reorder** — deferred to v2.
- **Block unlock semantics** — when a block spans days on the
  calendar, does the block "start" on its earliest activity? To
  confirm in build.
- **Block "done" rollup** — does a block auto-complete when every
  activity inside is done, or does the tutor mark blocks as
  separately checkable? Provisional answer: auto-complete (the
  block is just a wrapper, not a separate task). Confirm in build.
- **Preview mode** — tutor viewing a cohort as a student would
  see it. Deferred to build.
- **Duplicate-programme / duplicate-cohort flows** — listed in
  Programme Structure (main.md) as tutor capabilities; UI mockup
  deferred.
- **Multi-tutor edit conflicts** — two co-tutors editing the same
  unit simultaneously. Low priority for v1 volumes; revisit if it
  causes issues in pilots.
- **Cohort-only content overrides** — explicitly *not* in v1. A
  cohort can add or remove activities/blocks but cannot edit the
  body of a template activity for itself only. Revisit if real
  tutor demand surfaces.
- **Self-paced enrolment flow** — v1 build, design pending.
  Students click *Enrol*, pick an access window (90 / 180 / 365
  day options TBD with Pricing), pay, land on unit 1. Drafted as
  screen 12 below; full mockup queued for the slice that ships
  self-paced enrolment.
- **Self-paced student dashboard** — v1 build, design pending.
  Programme-scoped (no cohort), no live-session card; otherwise
  mirrors the tutor-led cohort dashboard. See *Student dashboard*
  in [main.md](main.md).
- **Self-paced progression rules** — exact gating model
  ("complete unit N to unlock unit N+1" vs "all units open from
  day one" vs "tutor-set per-unit prerequisite") finalised in
  build, not in planning.
- **Self-paced access-window pricing** — duration tiers vs
  unlimited, decided alongside the Pricing topic in build.

---

## Related

- [main.md](main.md) — overall product plan (Programme Structure
  covers programme definitions, delivery modes, cohort model,
  activity types, tutor actions).
- [bank.md](bank.md) — question bank, source of the
  question-selection UI used by Mock and Practice quiz editors.
- [tutor-library.md](tutor-library.md) — BUILT. Adds **Library Note**
  (7th type) + **Library Shelf** (8th type) as curriculum activities
  ("Option C": a first-class `nclex_programme_activities` row linked to
  a library attachment row by `activity_id`). These two don't use a
  per-type editor in the standard activity modal — they have their own
  attach modals (pick a published note / pick a shelf); shelf member
  hide/unhide + "Make visible here" live in the shelf edit modal.
- [mockups/curriculum-authoring-ux.html](mockups/curriculum-authoring-ux.html)
  — visual mockups from the 2026-04-20 session.
