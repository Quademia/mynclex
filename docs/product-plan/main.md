# MyNclex — Product Plan

*Living document. Filled in as decisions get made.*
Last updated: 2026-06-19 (Journey Tracker reframed as the product's
**third pillar** — a tutor↔student case-management layer with
configurable rich stages, stages-as-priced-services, and a
relationship-scoped access model; full design in
[journey-tracker.md](journey-tracker.md). The old "fixed phases 0–7,
QAcademy-provided" section is superseded.)
Earlier: 2026-05-11 (curriculum architecture rework — modules renamed to **blocks**; weeks abstracted to a generic **units** layer; activities can live loose under a unit or inside a block; **delivery modes** introduced — tutor-led cohort vs self-paced — **both ship in v1**; **unit label is an independent tutor choice** (Week / Module), decoupled from delivery mode, with smart defaults. Programme/cohort split from 2026-05-10 retained.)

---

## What MyNclex Is

An NCLEX-RN exam prep product inside the QAcademy family. Two layers:

- **The Bank** — a QAcademy-owned NCLEX-RN question bank, available
  standalone for self-study.
- **Tutored Programmes** — vetted tutors run structured NCLEX prep
  curricula (paced unit-by-unit, with guided activity blocks built
  around tutorials and self-study workflows, live sessions with
  recordings hosted on-platform) using the shared bank.

Core early audience: Ghanaian nurses pursuing migration to the US / UK /
Canada. Open to anyone internationally.

## In Scope for v1

- NCLEX-RN question bank (QAcademy-owned content, all 9 question types
  including NGN items — see **The Bank** section)
- Vetted tutors (Sam + approved others, manual onboarding — no public
  self-signup)
- Tutor-owned curriculum: pacing units (shown as Weeks in tutor-led
  mode), optional activity **blocks** for tutorial-anchored or
  guided workflows, individual activities (pre-tutorial reading,
  practice quizzes, mocks, etc.)
- Live tutorials via external video conferencing; recordings hosted
  inside MyNclex after sessions
- Student enrolment into tutor programmes (bundles bank access for
  programme duration)
- Bank-only subscription for self-study students
- International-friendly payments (GHS + card)

## Roles

MyNclex has four roles. A single user can hold more than one role
(e.g. Sam is SUPER_ADMIN and TUTOR).

- **STUDENT** — buys the bank for self-study, or enrols in a tutor's
  programme (which bundles bank access for the programme's duration).

- **TUTOR** — runs programmes on MyNclex. Uses the shared, QAcademy-
  owned bank. Manages their own students and their own programme
  content. Onboarded manually in v1 (no public self-signup).

- **ADMIN** — trusted helpers who assist with running the platform.
  An ADMIN has no default powers — a SUPER_ADMIN grants specific
  permissions per user, so two admins can have non-overlapping
  responsibilities (e.g. Admin A handles payments, Admin B manages
  the bank).

- **SUPER_ADMIN** — Sam (and any future platform owners). Has every
  permission implicitly. Is the only role that can create, remove,
  or change permissions on ADMIN users.

### Notes

- **No platform-level "programmes" category.** Unlike MyNMCLicensure
  (which has RN, RM, RPHN as platform-level programmes), MyNclex is
  NCLEX-RN only. A "programme" in MyNclex always means a tutor's own
  prep offering (e.g. "Dr Mensah's 8-Week NCLEX Bootcamp"), owned by
  the tutor who created it. A programme is the *reusable design* — a
  specific run of that programme for a specific group of students is
  a **cohort** (see Programme Structure below).

- **Multiple tutors per programme is supported.** One programme can
  be co-run by two or more tutors. In v1 every co-tutor on a
  programme is automatically on every cohort of that programme;
  cohort-level co-tutor restrictions are deferred.

- **Permission list for ADMIN is deferred.** We will define the exact
  permission buckets once the other topics (pricing, programme
  structure, tutor onboarding, bank, etc.) have surfaced the real
  admin tasks that need permissioning.

## Journey Tracker

> **Reframed 2026-06-19.** The Journey Tracker is now the product's
> **third pillar** (alongside the Bank and Programmes) — a
> tutor↔student case-management layer for the whole licensure journey,
> *broader than* and *containing* a programme. This section is the
> overview; the full design lives in
> [journey-tracker.md](journey-tracker.md). It supersedes the earlier
> "fixed phases 0–7, QAcademy-provided, student-self-update" framing.

The Journey Tracker is the tooling a tutor uses to tell a student
*"here's what I can help you with on your NCLEX journey, and here's
where you are."* Headline shape:

- **Third pillar.** Bank (questions) · Programmes (structured prep) ·
  **Journey** (the tutor-managed case). A programme plugs into the
  exam-prep *stage* of a journey — the journey is the parent, not the
  programme.
- **Tutor as case manager.** MyNclex's tutors already act as migration
  agents in real life (CGFNS registration, board applications, etc.).
  The tracker is the tool they run that work through. Both tutor and
  student act on a case (requests, uploads, status, a who-did-what
  trail).
- **Two tiers.** A light, **self-managed** **Pathway Guide** for *every*
  student — they tailor their own roadmap and self-mark (no tutor
  machinery) — account-level, persists past bank-pack expiry, doubles as
  the onboarding spine; and the rich tutor-run **Managed Case**. They share
  one template spine; the guide upgrades to a managed case when a tutor
  takes the student on (the student's edits + self-marks carry over).
  Bank-only students get the guide only; Tier 1 is free (a funnel/retention
  surface).
- **Configurable, not hard-coded.** No fixed phase list. QAcademy ships
  per-destination **starter templates** (e.g. the Ghana→US pipeline:
  CGFNS credential evaluation → English (conditional) → state-board
  application → NCLEX → licensure → VisaScreen → EB-3 immigration).
  Tutors customise **at the template level** (shape once, reuse for most
  students) — cloning a starter into their own saved template — and
  assign it as-is, adding **student-specific** steps only for the
  exceptions (a pathway is an independent instance; per-student edits
  don't touch the template). A dedicated **"My Pathways" tab** is where
  tutors manage those templates.
- **Rich stages with sub-steps.** A stage holds a documents checklist,
  reference numbers, dates, uploads, and a status lifecycle
  (`not started → in progress → submitted/waiting → complete`). A stage
  can expand into sub-steps (two levels), with status rolling up.
- **Stages as priced services + packages.** Tutors offer stages as paid
  services (à la carte or bundled into a package). **QAcademy takes no
  cut and never touches the money** — collection is off-platform; the
  platform provides invoicing + paid-tracking only.
- **Access is relationship-scoped.** A case is visible to the student
  and their assigned tutor(s); other tutors are excluded; **admins keep
  normal platform oversight** (no special blind spot).

### Tracker ↔ tutor programme link

A tutor programme plugs into the **exam-prep stage** of the journey.
Enrolling in a programme updates that stage; the programme/cohort is a
child of the stage, not the root of the journey. A student can be
managed through credentialing before any course exists, or keep a tutor
for later stages after exam prep ends.

See **[journey-tracker.md](journey-tracker.md)** for the full design,
data-model shape, open items, and deferrals.

## Programme Structure

> **Revised 2026-05-11.** Curriculum architecture rework. Modules
> renamed to **blocks** (workflow groupings of related activities,
> often built around a tutorial); weeks abstracted to a generic
> **units** layer; activities can live loose under a unit OR inside
> a block (blocks are not mandatory containers). **Delivery modes**
> introduced — every programme is either tutor-led (with cohorts)
> or self-paced (no cohorts) — and the same curriculum engine
> serves both. **Both modes ship in v1.**
>
> The **unit label** (what the tutor and students see — Week or
> Module) is a **separate tutor choice** at programme creation,
> decoupled from delivery mode. Smart default: tutor-led →
> Week; self-paced → Module. Tutor can override (e.g. a
> topic-organised tutor-led programme uses Modules; a self-paced
> programme with a suggested 12-week pacing plan uses Weeks).
> Same DB layer either way; only the rendered label changes.
>
> Programme/cohort split (2026-05-10) retained: programme = reusable
> design, cohort = one specific run. Curriculum lives at the
> programme layer (units → blocks → activities); dates, seats,
> enrolment, and delivery state live at the cohort layer (tutor-led
> mode only). Original 2026-04-19 / 2026-04-20 decisions preserved
> in session log.

A tutor's programme is a paid, tutor-owned NCLEX prep offering that
plugs into Phase 4 of the Journey Tracker. One or more tutors can
co-run the same programme.

### Delivery modes

Every programme is one of two delivery modes. **Both ship in v1.**

- **Tutor-led** — students enrol in a specific **cohort** of the
  programme. The cohort owns the schedule (live sessions, release
  dates), seat cap, and enrolment list. Default unit label is
  **Week** (tutors typically plan by the week), but the tutor can
  override this — see *Unit label* below.
- **Self-paced** — students enrol directly in the programme; no
  cohort layer. Activities are gated by `is_published` and student
  progression, not by cohort release dates. Default unit label is
  **Module** (solo learners typically think topic-by-topic), but
  the tutor can override.

`programme.delivery_mode ∈ ('TUTOR_LED', 'SELF_PACED')`. The
curriculum engine itself (units → blocks → activities) is identical
across modes — the differences are only (a) presence/absence of the
cohort layer and (b) how access is gated (cohort release dates vs
`is_published` + progression).

The rest of this section describes the tutor-led shape in depth,
with self-paced deltas called out where they matter. A separate
*Self-paced surface* subsection at the end covers the bits unique
to that mode.

### Unit label

A **separate tutor choice** at programme creation, stored as
`programme.unit_label ∈ ('WEEK', 'MODULE')`. Decoupled from
delivery mode — all four combinations are valid:

| Mode | Unit label | When this fits |
|---|---|---|
| Tutor-led | Week | Default. The bootcamp pattern. |
| Tutor-led | Module | Topic-organised tutorial series ("Module 1: Cardiac, Module 2: Renal", with weekly live tutorials *inside* each module). |
| Self-paced | Module | Default. The Coursera pattern. |
| Self-paced | Week | Self-paced course offering a suggested weekly pacing plan. |

**Smart default** at form-fill time: picking Tutor-led pre-selects
Week; picking Self-paced pre-selects Module. Tutor can override
either way before submitting. Editable later from programme
settings (no data migration — purely a label flip in render).

The label drives every render site that says "Week N" or "Module
N" (curriculum editor, calendar, cohort cards "Week 3 of 8",
student dashboard, history, analytics) via a single
`unitLabel(programme)` helper.

### Two-layer model (tutor-led)

Students enrol in cohorts, not directly in programmes.

```
Tutor
  ↓ owns
Programme           — reusable design (curriculum, brand, price)
  ↓ has many
Cohort              — one run (dates, seats, enrolments, schedule)
  ↓ enrols
Student
```

- **Programme** — the reusable teaching product. Owned by a tutor.
  Holds the curriculum (units → blocks → activities) and the
  brand-level fields (title, tagline, description, length in units,
  prices, public-price toggle).
- **Cohort** — one specific run of a programme for a specific group
  of students. Holds dates, seats, enrolment list, live-session
  schedule, mock due dates, announcements, and a checklist of
  *which* template activities are included in this cohort (in what
  order, with cohort-specific release dates).

A tutor can run many cohorts of the same programme over time
(e.g. *Jan 2027*, *April 2027*, *Weekend Intensive*). They iterate
the programme's curriculum forward; cohorts inherit the improvements
without breaking already-launched ones (see *Curriculum propagation*
below).

### Programme layer

#### Programme fields

| Field | Required | Notes |
|---|---|---|
| Delivery mode | ✓ | `TUTOR_LED` (default) or `SELF_PACED`. Drives presence/absence of the cohort layer. Set at create-time only. |
| Unit label | ✓ | `WEEK` or `MODULE`. Smart default from delivery mode (Tutor-led → Week; Self-paced → Module); tutor can override. Editable later. |
| Title | ✓ | |
| Tagline | — | One-liner shown on the public card |
| Description | — | Long copy for the public detail page |
| Length (units) | ✓ | Number of curriculum units. Form label flips with `unit_label`: "Length in weeks" or "Number of modules". Stored as a unit count. |
| Price (GHS) | ✓ | 0 = free |
| Price (USD) | ✓ | 0 = free |
| Show price publicly | toggle, default ON | OFF → "Contact" button publicly |

Pricing is set once per programme and applied to every cohort of
that programme. Cohort-level pricing variation (early-bird, holiday
promo) is deferred to v2.

#### Programme status

`DRAFT / PUBLISHED / ARCHIVED`. Set by tutor actions, not by the
create form.

- `DRAFT` — invisible to the public; the tutor is still building.
- `PUBLISHED` — visible to the public **only if at least one
  open cohort exists**. A published programme with zero open
  cohorts is treated as not-yet-discoverable; the catalogue
  doesn't list it. (Prevents dead-end pages.)
- `ARCHIVED` — retired by the tutor. No new cohorts can be
  launched; existing cohorts run to completion.

#### Curriculum

Curriculum lives at the programme layer — four layers, with the
middle one (blocks) optional:

```
Programme  →  Unit  →  Block (optional)  →  Activity
```

- **Unit** — top-level pacing/grouping container; the tutor chooses
  how many (typical 3 / 4 / 6 / 9 / 12; no platform-fixed length).
  Pre-slotted for all N units (empty units shown as dashed
  placeholders so the tutor always sees the full programme shape).
  Rendered as **Week N** or **Module N** in the UI per the
  programme's `unit_label` (a separate tutor choice — see *Unit
  label* above). Same DB layer either way; only the rendered label
  changes.
- **Block** *(optional)* — a guided workflow grouping of related
  activities the student treats as one push. Common shapes: a
  tutorial-anchored block (pre-tutorial reading + the live tutorial
  + a post-tutorial quiz, all wrapped together); or an asynchronous
  sequence like PDF → practice quiz → revision drill. A live session
  is a *common* anchor but not a requirement — a block can be
  entirely asynchronous, which makes blocks just as useful in self-
  paced programmes as in tutor-led ones.
- **Activity** — a single actionable learning item. Activities are
  the leaf nodes; they're what the student actually does. See
  *Activity types* below for the v1 set.

#### Loose vs. blocked activities

An activity lives directly under a unit (loose) OR inside a block
within a unit. Blocks exist when a tutor wants the student to treat
several activities as one workflow push. Decision rule for the
tutor:

- *"Do I want the student to treat these as one push?"* → block.
- *"Is this just a thing for this unit?"* → loose.

This avoids fake single-activity blocks (which would dilute what a
block means) and matches how a tutor actually plans: a unit
containing one orientation live session + one welcome quiz doesn't
need a block wrapper; a unit covering Cardiac Pharmacology with
PDF + practice quiz + revision drill + tutorial debrief earns one.

Schema implication: `activity.unit_id` is required;
`activity.block_id` is nullable. `block_id IS NULL` means the
activity is loose under its unit.

See [curriculum-authoring-ux.md](curriculum-authoring-ux.md) for
the editor screens.

#### Activity types (v1)

- Text content (rich-text notes)
- PDF upload
- External video link (YouTube, Vimeo, recorded-session URL, etc.)
- Practice quiz (assigned questions from the shared NCLEX bank or
  the tutor's private bank)
- Live session (external video-call link; recording URL added after)
- Mock assessment
- **Library Note** — a single reusable note from the tutor's library,
  attached to a unit (BUILT, slice 11.11; see
  [tutor-library.md](tutor-library.md))
- **Library Shelf** — a whole curated pack of notes, attached as one
  atomic activity (BUILT, slice 11.12)

> Library Note + Shelf were originally listed as v2-deferred; they
> shipped in 2026-06 as the 7th + 8th activity types ("Option C" — a
> first-class `nclex_programme_activities` row linked to a library
> attachment row).

#### Activity types deferred to v2

- Uploaded video files (storage and bandwidth cost)
- Written assignments with tutor grading (requires submission and
  feedback workflow)

### Cohort layer

#### Cohort fields

| Field | Required | Notes |
|---|---|---|
| Cohort name | — | Auto-generated from dates (*"5 Jan – 27 Mar 2027"*); tutor can override (e.g. *"Weekend Intensive"*). |
| Start date | ✓ | Anchors week 1; the cohort's week N runs from `start + (N-1)*7` days. |
| End date | ✓ | Auto-fills from start + length × 7; tutor-editable to extend bank access beyond the curriculum. |
| Cohort size (max students) | — | Blank = no cap. |
| Allow late join | toggle, default OFF | When OFF, enrolment closes at `start_date`. When ON, allows enrolment past start (tutor's discretion, no platform-enforced cutoff). |

#### Cohort status

`UPCOMING / IN_PROGRESS / ENDED / CANCELLED`. Mostly derived from
dates; CANCELLED is an explicit tutor/admin action.

- `UPCOMING` — `today < start_date`. Enrolment open.
- `IN_PROGRESS` — `start_date ≤ today ≤ end_date`. Enrolment open
  only if *allow late join* is ON.
- `ENDED` — `today > end_date`. No new enrolments; existing
  students retain bank access until the end_date already paid for.
- `CANCELLED` — explicit cancel. Hidden from public; refunds
  handled manually off-platform.

#### What a cohort owns

- The enrolled students for this run.
- The schedule: live session times, mock due dates, weekly release
  dates.
- The activity checklist — which template activities are included
  in this cohort, in what order, plus any cohort-only additions.
- Announcements posted to this cohort's students.
- Per-cohort completion data (student progress is scoped to the
  cohort they're enrolled in).

### Curriculum propagation

The programme layer owns the curriculum *content*. The cohort layer
owns the cohort's *checklist* of which activities are in. Two
propagation rules:

- **Content edits propagate automatically.** When the tutor fixes a
  typo, swaps a video link, improves an explanation, or adjusts a
  quiz key — every live cohort sees the update on the next student
  view. Single source of truth.
- **Structural changes do not propagate.** When the tutor adds a
  new activity to the programme, removes one, or reorders the
  curriculum — already-launched cohorts are unaffected. The tutor
  opts in per cohort: "add this new template activity to cohort
  X?" or "remove this from cohort X only?".

A cohort can also add **cohort-only activities** that don't exist
in the programme template — useful for a workshop the tutor decides
to add for one specific intake. Cohort-only activities live only in
that cohort and do not flow back to the template.

Template "deletes" are soft-deletes — cohorts that already
included the activity keep working; only new cohorts and not-yet-
added activity slots stop seeing it.

### Enrolment paths

Two paths in v1, both at the cohort layer:

- **Self-paid** — student finds the programme on the public listing,
  picks an open cohort, and pays via the bundled checkout. See
  [payments-and-enrolment.md](payments-and-enrolment.md).
- **Tutor-added** — tutor adds a student directly to a specific
  cohort from inside the cohort workspace, at any point in the
  cohort's lifecycle. No platform-enforced enrolment window or
  cut-off date.

Tutor-added enrolments comp the bundled bank-pack subscription for
the cohort's duration; QAcademy absorbs the cost. Tracked via
`enrolment_source ∈ ('SELF_PAID', 'TUTOR_ADDED', 'ADMIN_GRANT')` on
`nclex_enrolments` (full definitions in payments-and-enrolment.md →
"Settled 2026-05-18 — enrolment-source values"). Per-tutor quota
(capping how many tutor-added
enrolments a tutor can comp based on their subscription tier) is
deferred to a later slice.

### Revenue model

Settled in the Pricing section. In brief: tutors pay a flat monthly
platform subscription; students pay QAcademy directly for a
subsidised bank bundle matched to **the cohort's duration** at
enrolment; tutor programme fees stay off-platform between tutor and
student. No automated payment splits in v1.

### Content visibility

- **Programme-level visibility**: activities carry a Live / Draft
  pill in the curriculum editor (`activity.is_published`). Draft
  activities don't appear in any cohort's checklist until the
  tutor publishes them.
- **Cohort-level release** *(tutor-led mode)*: each cohort activity
  has a release date defaulted from the cohort's start date + the
  activity's unit index (treating each unit as one calendar week
  by default — independent of whether the unit's label is "Week" or
  "Module"). Students see an activity once its release date passes.
- **Progression-based gating** *(self-paced mode)*: no cohorts, no
  release dates. Activities gate by `is_published` (tutor-controlled)
  plus optional student-progression rules (e.g. "complete unit 1
  to unlock unit 2" — exact progression model finalised in build).
- **"Done" logic:** mixed. Practice quiz and mock assessment
  activities auto-complete from their score. Passive content (text,
  PDF, external video link) is student-ticked. Live session is
  student-ticked (or auto-complete when the tutor posts the recording
  — refined in build). When activities are grouped inside a block,
  the block is "done" once every activity in it is done.

### Student dashboard (v1)

Two shapes, one per delivery mode of the programme the student is
enrolled in.

**Tutor-led cohort dashboard** — scoped to the student's current
cohort:
- Current unit number and unit progress bar (relative to the
  cohort's calendar; labelled "Week N" or "Module N" per the
  programme's `unit_label`)
- Overall cohort progress %
- Next live session (date + join link)
- Most recent mock assessment score
- Journey tracker snapshot (current stage, % through it)

A student enrolled in multiple cohorts sees a cohort switcher; one
dashboard per cohort.

**Self-paced dashboard** — scoped to the programme directly (no
cohort layer):
- Current unit (whichever the student last touched) + unit
  progress bar, labelled per `unit_label`
- Overall programme progress %
- *(no next-live-session card — self-paced programmes typically
  don't run live sessions; if a tutor adds one as a one-off
  activity, it appears in the unit's activity list like any other)*
- Most recent mock assessment score
- Journey tracker snapshot

A student enrolled in multiple self-paced programmes sees a
programme switcher.

### Tutor actions (v1)

Tutor actions split between programme-level and cohort-level.

**Programme-level (the reusable design):**

1. Create and edit a programme (delivery mode, unit label, title,
   tagline, description, length in units, dual GHS+USD price,
   public-price toggle). Created via a modal triggered from My
   Programmes — see [curriculum-authoring-ux.md](curriculum-authoring-ux.md).
   The first cohort can be created in the same modal (tutor-led
   mode only).
2. Build the curriculum — units, blocks, activities. Add / edit /
   delete / reorder. Activities can be loose under a unit or grouped
   inside a block. Edits propagate to live cohorts.
3. Publish / unpublish / archive the programme.
4. Duplicate a programme (start from an existing curriculum
   instead of an empty one).

**Cohort-level (the specific run):**

5. Launch a new cohort of a programme (sets start_date, end_date,
   size, late-join toggle, optional name override).
6. Manage the cohort's checklist — add / remove template
   activities for this cohort only, reorder, add cohort-only
   activities.
7. Schedule live sessions, post recording URLs after each session.
8. View the list of enrolled students in this cohort.
9. View a single student's detail (week-by-week completion, mock
   scores, current journey-tracker phase).
10. Message one student in a cohort, or the whole cohort.
11. Post announcements to a cohort.
12. Add a student manually (tutor-added enrolment).
13. Archive or cancel a cohort.

### Co-tutors

A programme can have one or more tutors. In v1, all tutors on a
programme have identical powers — no owner/assistant split, and
every co-tutor is automatically on every cohort of that programme.
Cohort-level co-tutor restrictions (e.g. one cohort run solely by a
co-tutor, another by the owner) are deferred to v2.

### Bank usage inside a programme

Programme question sets can draw from two sources:

1. **QAcademy bank** — shared, QAcademy-owned. Tutors can assign bank
   questions into practice-quiz activities. Tutors cannot edit bank
   questions or add to the shared bank. (The QAcademy bank is itself
   a standalone product sold to self-study students, so its integrity
   is protected.)
2. **Tutor's own questions** — tutor-authored. Private to the tutor.
   Reusable across that tutor's programmes. Not visible to any other
   tutor, and not added to the shared bank.

### Student access to questions

- **QAcademy bank questions** are visible to a student if the student
  has any active QAcademy bank pack — either purchased standalone
  (self-study) or purchased as the subsidised bundle at cohort
  enrolment.
- **Tutor-authored questions** are visible only to students enrolled
  in one of that tutor's cohorts, and only inside that cohort's
  assignments.

### Self-paced surface (the deltas)

Self-paced programmes share the curriculum engine and almost every
authoring screen with tutor-led, but a few surfaces differ. v1
ships both modes. The deltas:

- **No cohort layer.** A self-paced programme has no cohorts. The
  cohort screens (Cohorts tab, New Cohort modal, cohort detail
  subtree) are hidden for self-paced programmes.
- **Direct enrolment.** Students enrol in the programme itself,
  not in a cohort. The enrolment row carries
  `enrolment_source ∈ ('SELF_PAID', 'TUTOR_ADDED', 'ADMIN_GRANT')`
  (same shape as tutor-led), but with `cohort_id = NULL`.
- **Access window** is set per enrolment (e.g. 90-day, 180-day,
  unlimited).
  ⚠ **CORRECTED 2026-08-23.** This bullet used to end "…rather than
  bounded by cohort start/end dates", which implied a COHORT's access
  *is* bounded by its dates. It is not, and the difference is not
  academic. Access is frozen at enrolment as
  `enrolled_at + programme.access_window_days` in **both** modes —
  anchored to when each person joined — so members of one cohort
  routinely hold different end dates, and `nclex_cohorts.end_date` is a
  **timetable** that need not resemble any of them. Dev has a cohort that
  ran 1–28 Jul 2026, is badged *Ended*, and whose students keep access
  until 24 Jun 2027. The nightly sweep expires on `access_expires_at`, so
  that column — not the cohort's dates — is what actually cuts a student
  off. ⓘ This wrong assumption was read straight out of this document and
  written into code before the data contradicted it; the tutor Progress
  surfaces now show the real per-student figure in both modes.
- **No release dates.** Activities gate by `is_published` plus
  optional progression rules — see *Content visibility* above.
- **No live-session scheduling assumption.** A self-paced programme
  *can* include a Live session activity (one-off office hour, etc.)
  and it renders normally, but the surface doesn't assume one
  exists.
- **No calendar view.** The Units / Calendar segmented toggle on
  the curriculum editor hides the Calendar option in self-paced
  mode — there's no cohort calendar to project against.
- **Its own progress surface** (added 2026-08-23). ⚠ Every other bullet
  here says what self-paced *hides*; this one says what it needs
  **instead**, and the omission had a cost. Tutor analytics were built
  per-cohort, so for six months a self-paced tutor could see who had paid
  and nothing else — no way to tell whether anybody had ever opened the
  curriculum. Self-paced now has a **Progress** page at programme level
  (`/tutor/programme/[id]/progress`), the counterpart of the cohort's
  Progress tab, because the programme *is* the delivery unit. It uses a
  time-based engagement vocabulary rather than the cohort's pace
  vocabulary — without a shared calendar, "behind" has no meaning.
  Canonical: **progress-engine.md §6.4**.
  ⭐ A useful reading of the whole mode boundary came out of it (Sam):
  **a self-paced programme is one cohort with late joins** — every member
  with their own start date, their own end date, no release gates, no
  live sessions.
- **Public listing line.** "Length 8 weeks · next cohort 5 May"
  becomes "Length 8 modules · self-paced" (or whatever the unit
  label is). Pricing surface unchanged.

Everything else — the curriculum editor, activity types, blocks,
loose-vs-blocked rule, library notes, mocks, practice quizzes,
the bank — is identical across modes. The mode boundary is
deliberately narrow.

### Open items within programme structure

- Journey-tracker **starter-template content** (the per-destination
  default stages QAcademy ships) is a content task handled during build,
  not in planning. (Note: this is a neutral *starter* tutors customise —
  not a fixed admin-authored pipeline. See
  [journey-tracker.md](journey-tracker.md).)
- Revenue model is parked in the Pricing topic.
- Cohort-only *content overrides* (a cohort changes the body of a
  template activity for itself only) are deliberately not in v1 —
  cohorts can add and remove, but not override content. Revisit if
  real tutor demand surfaces.
- **Self-paced progression rules** — exact gating model ("complete
  unit N to unlock unit N+1" vs "all units open from day one" vs
  "tutor-set per-unit prerequisite") finalised in build, not in
  planning.
- **Self-paced access-window pricing** — whether to sell as
  duration tiers (90 / 180 / 365 days) or as one-off purchase
  (unlimited access). Decided alongside the Pricing topic in build.

## Tutor Onboarding

MyNclex is a vetted marketplace, not an open tool. Students enrolling
in a tutor's programme are trusting QAcademy's vouch for that tutor,
so the bar is deliberately high.

⚠ **CORRECTED 2026-08-22.** This paragraph used to continue: *"No public
self-serve tutor signup in v1 — every tutor account is created by admin
after an off-platform vetting conversation."* Both halves have changed,
and the first sentence above has not:

- **Self-serve application IS built** (tutor-onboarding slice 2, Sam
  re-opened the deferral on 08-21). Anyone can apply from `/for-tutors`.
- **Vetting is unchanged in substance** — a human still decides, and
  nobody becomes a tutor without an approval. What moved is *where*: an
  admin decides in `/admin/applications` instead of by hand-written SQL,
  and an applicant no longer needs to know somebody to be considered.

Canonical: `docs/product-plan/tutor-onboarding.md`.

### Application intake

A public "Become a Tutor" page on the MyNclex site serves two
purposes: collecting prospective-tutor applications, and acting as
marketing for the programme model.

- Applications submitted via the public form are stored in a
  `nclex_tutor_applications` table, with status values:
  `NEW`, `CONTACTED`, `APPROVED`, `REJECTED`.
- Admin can view a list of applications with their status — a simple
  funnel view, not a full vetting dashboard.
- No approve-and-auto-provision flow. Approval is recorded as a
  status change; account creation is a separate, explicit admin
  action (below).

### Vetting

Vetting itself happens off-platform — email, WhatsApp, calls,
sometimes a trial session. Criteria (qualification, experience,
teaching style, cultural fit) are judged case-by-case by admin; no
on-platform checklist in v1. If volume increases, a structured
vetting workflow may be introduced in v2.

### Account creation

Once admin decides to approve an applicant:

1. Admin clicks "Create tutor" in the admin area and enters the
   tutor's name and email.
2. The new account is created in a `PENDING_SETUP` state.
3. The tutor receives a setup-link email.
4. The tutor follows the link, sets their own password, and logs in.
5. The account becomes `ACTIVE` on first successful login.

No admin-generated temporary passwords shared over insecure channels.

### Required tutor profile

Before a tutor can publish their first programme, the following
profile fields must be filled in:

1. Display name (shown on programme listing)
2. Photo / avatar
3. Short bio (1–2 paragraphs, shown on programme listing)
4. Credentials (e.g. "BSN, RN, 8 years ICU experience")
5. Country / region

Optional fields (not required to publish):
- Longer "about me" page
- External links (LinkedIn, personal site)
- Languages spoken

### Tutor dashboard (v1 first view)

When a tutor logs in, the default view shows:
- Programmes they own or co-run (cards: title, status, student count,
  next live session)
- Quick actions: Create programme, Create question, Message cohort
- Platform announcements from admin

### Deactivation

An active tutor may be deactivated by admin (e.g. they quit,
underperform, or are removed). Deactivation is a **soft stop**:

- The tutor is hidden from the public tutor list and programme
  listings — no new enrolments accepted for their programmes.
- Existing active cohorts continue to their scheduled end date;
  students who paid for a cohort finish it.
- Urgent reassignments (e.g. tutor vanishes mid-cohort) are handled
  off-platform in v1 — admin coordinates with the co-tutor, or
  issues refunds manually.
- A cohort-reassign flow may be added in v2 if this becomes common.

### Self-deletion

Tutors cannot delete their own accounts in v1. Tutors are a curated
group; removal requires a conversation about data retention and
cohort handover. A tutor wishing to leave contacts admin by email;
admin then follows the deactivation flow above.

## Pricing

QAcademy is a content company with a tutor marketplace attached. The
bank is the main revenue product; tutor subscriptions are a low-cost
supply-side loss leader; bundled bank access to tutored students
scales with tutor success.

### Currency

- Dual currency in v1.
- Users registering from Ghana see and pay in **GHS**.
- All other users see and pay in **USD**.
- Region is captured via a "Where are you registering from?" question
  at signup, stored on the user profile. No IP-based detection
  (unreliable: VPNs, diaspora, mobile carrier routing).
- Every product has two price fields: `price_ghs` and `price_usd`.
  Both are required at product creation — neither is derived from
  the other. This preserves price psychology (round numbers in each
  currency) and avoids FX drift changing prices silently.
- Paystack is the processor for both currencies; settlement to the
  QAcademy bank account is in GHS regardless of charge currency.

### Bank (QAcademy-owned)

- Sold as duration-tier packs: **30 / 90 / 180 days**.
- A short free trial (duration TBD in build) is offered as a marketing
  taster, not a paid tier.
- 365-day packs and freemium-tier-style unlimited access are deferred
  to v2.

### Readiness packs

- Separate QAcademy-owned product, distinct from the bank subscription.
- Full-length, exam-simulating mock tests (provisionally 5 in v1).
- Sold as: single pack, three-pack bundle, all-packs bundle.
- Independent of bank access — can be purchased with or without the
  bank.
- **Canonical plan: [readiness-packs.md](readiness-packs.md)**
  (created 2026-07-04 — consolidates format, pricing, reservation,
  storage and the open build questions).

### Tutor revenue model

Tutors pay QAcademy a **flat monthly subscription** to use the
platform. They run unlimited cohorts and keep 100% of their student
revenue, which they collect and manage off-platform.

- No per-enrolment commission.
- No automated payment splits between QAcademy and tutors (matches
  the v1 deferral in CLAUDE.md).
- No per-seat fees.
- Single subscription tier in v1. Tiered subscriptions are a v2
  candidate.

This model matches the dominant industry pattern (Teachable,
Thinkific, Kajabi, Podia, FreshLearn) and positions QAcademy as a
platform tutors rent, not a commission-taking middleman.

### Tutored students and the bank

Cohort enrolment **bundles** bank access for the cohort's
duration — but at a subsidised price, not free.

- When a student enrols in a tutor's cohort, they pay QAcademy
  directly for a cohort-duration-matched bank pack, at a discounted
  rate.
- The discount is QAcademy's contribution to the programme's value.
- Tutor has no variable cost tied to a cohort's size — their
  subscription stays flat.
- Student sees a clean enrolment flow: tutor fee paid to the tutor
  (off-platform, in the tutor's currency), bank access paid to
  QAcademy (on-platform, in the student's registered currency).
- Subsidy level: **50% of the standalone bank price** for the closest
  matching duration, rounded up so no student is ever mid-week with
  expired bank access.
- Subsidy price is set globally by admin. Tutors do not control it.
- Cohort-level pricing variation (early-bird, holiday promo, foundation-
  vs polished-cohort tiers) — **BUILT 2026-06-22** (Slices 1–3): a cohort
  can carry its own plan set (clone-and-edit) via a `cohort_id` override
  on the strategies table + a Programme-pricing ↔ Custom toggle on the
  cohort **Pricing** tab; checkout reads the cohort's effective plans
  (custom else programme). See
  [payments-and-enrolment.md](payments-and-enrolment.md) → *Cohort-level
  payment plans → BUILD NOTE*. By default (no override) the programme's
  price still applies to every cohort.

### Provisional numbers

These numbers are anchors for planning only. All must be
market-validated before public launch.

| Product | Price (USD) | Price (GHS) |
|--|--|--|
| Tutor monthly subscription | $29 (USD only — settled 2026-05-18) | — |
| Self-study bank, 30-day | TBD | TBD |
| Self-study bank, 90-day | $40 | ~480 |
| Self-study bank, 180-day | TBD | TBD |
| Tutored-student bank bundle (matched duration) | ~$20 (50% of 90-day) | ~240 |
| Readiness pack, single | TBD | TBD |
| Readiness pack, three | TBD | TBD |
| Readiness pack, all | TBD | TBD |
| Tutor's programme price to students | tutor's own choice; 3,000 GHS / ~£200 / ~$250 is a sensible anchor for a 12-week programme |  |

### Revenue model strategic read

Based on rough scenario modelling:

- In year 1 (pilot), QAcademy revenue is small and roughly split
  across tutor subs, self-study bank sales, and tutored bundles.
- By year 2–3, **self-study bank sales dominate** revenue, followed
  by tutored bundles, with tutor subscriptions the smallest slice.
- **Revenue scales with student volume, not tutor count.** Marketing
  the bank directly to self-study students is the bigger revenue
  lever than growing the tutor base.
- Tutors remain valuable as (a) a vetted-marketplace brand signal
  that helps sell the bank, and (b) a customer-acquisition channel.
- This reinforces the vetted-marketplace choice: a diluted tutor
  brand would damage bank sales, which are the largest revenue
  source.

### Pricing-related items deferred to v2+

- Tiered tutor subscriptions (basic / pro with different feature sets)
- Annual discounts on tutor subscription
- Group / institutional licences for the bank
- Automated payment splits between QAcademy and tutors
- 365-day bank packs

## The Bank (Question Bank)

The NCLEX-RN question bank is the content layer that feeds both
self-study students (standalone access) and tutored programmes
(assigned inside Practice quiz and Mock activities). **Settled
2026-04-20.** Full schema, JSONB shapes, scoring functions, and
case-study details live in [bank.md](bank.md).

Headline decisions:

- **Parallel ownership model.** Identical-shape tables in two sets:
  QAcademy-owned (`nclex_bank_*`, `nclex_case_studies`,
  `nclex_readiness_packs`) — shared across all tutors and students.
  Tutor-private (`nclex_tutor_*`) — owned by each tutor, visible
  only in their programmes.
- **Seven core tables** — 4 QAcademy-owned + 3 tutor-private. No
  `nclex_tutor_readiness_packs` (readiness packs are a QAcademy-only
  product; tutors use Mock activities instead).
- **All 9 question types ship in v1** — MCQ, TF, SATA, Select N,
  Matrix, Highlight, Cloze, Drag-drop, Bow-tie. Trend items deferred
  to v2.
- **JSONB `content` + `correct` columns** on every question. `content`
  (pre-submit, safe for browser) holds the question structure.
  `correct` (post-submit only) holds the answer key **and**
  per-option / per-cell / per-slot feedback.
- **Five scoring functions** cover all 9 types, dispatched by
  `question_type`. NCSBN-exact logic, versioned separately from
  schema.
- **Case studies** = one row per scenario with 6 JSONB chart tabs
  (nurses' notes, vitals, labs, orders, history, diagnostics). Each
  entry has `visible_from` (1–6) for progressive chart unfolding as
  the student moves through the 6 CJMM questions.
- **Readiness packs** = curated QAcademy assessments with reserved
  questions. `is_builder_visible = FALSE` hides pack questions from
  the custom quiz builder; the pack runner loads them by ID directly.
- **10 classification axes** are all filterable at student build
  time (`question_type`, two client-needs fields, subject, system,
  topic, subtopic, difficulty, bloom level, tags).

Cross-topic effect: **Curriculum authoring UX is now unblocked** —
Practice quiz and Mock activity editors had "blocked on bank"
placeholders and were settled the same day
(see [curriculum-authoring-ux.md](curriculum-authoring-ux.md) and
mockups at
[mockups/curriculum-authoring-ux.html](mockups/curriculum-authoring-ux.html)).

## Content Sourcing

**Settled 2026-04-20.**

Content sourcing — producing the actual NCLEX-quality questions
that fill the bank — is an **editorial and business problem, not a
product-build problem**. It is explicitly out of scope for the
product-build plan.

### For development and testing

The bank will be seeded with synthetic sample questions covering
every question type, every chart structure, and a representative
spread of classification axes. These sample questions exist only to
exercise the schema, scoring functions, renderers, and admin/tutor/
student UIs end-to-end. They are not publication-quality NCLEX
items and are not intended for paying students.

### For launch

Sam (a nurse himself) will run a separate editorial process off-
platform with vetted nurse educators to produce the real bank. The
working model:

- **Authoring** happens wherever is most comfortable for the
  educators — Google Docs, Word, shared spreadsheets, WhatsApp.
- **Sam reviews and restructures** draft content as a nurse, in
  collaboration with the educators.
- **Final questions are typed into the admin** by Sam or a small
  internal team. By the time a question reaches the admin, it has
  already passed editorial review.
- **The admin is the publishing step, not the reviewing step.** No
  in-platform review workflow is built (see Decision A below).

This process runs on Sam's timeline, independently of product
development.

### Two small system decisions taken during this planning

**Decision A — No in-platform review workflow.**
Reviewing happens off-platform. The admin exposes a single
`is_published` boolean on every question. Draft questions
(`is_published = false`) are visible in the admin only. Published
questions (`is_published = true`) are visible to students and
tutors. No reviewer role, no approval queue. If a richer workflow
is ever needed, it is a small addition (two columns: `reviewed_by`,
`reviewed_at`) — easy to bolt on.

**Decision B — "Report this question" feature ships in v1
(minimum version).**
Students can flag any question they think is wrong. This is the
single best mechanism for improving bank quality over time and is
industry-standard for NCLEX prep (UWorld, Kaplan, Archer all have
it). Minimum version only:

- New table `nclex_question_reports` — columns: `id`, `item_id`,
  `student_id`, `reason` (free text), `status`, `created_at`.
- One button on the post-submission view of any question: "Report
  this question" → small text box → submits.
- One admin page: list of reports with question preview and two
  actions — "Dismiss" and "Mark for fix."

Explicitly **not** in v1: report categories (free text only, to
learn what matters), response-to-student flow (reports are one-way),
automatic retirement (admin decides), separate fix workflow (admin
edits in-place; reports stay for audit).

Both students in tutored programmes and self-study students can
report.

### Schema consequences (for the Bank build)

- `nclex_bank_items` gains a column: `is_published BOOLEAN DEFAULT FALSE`.
- `nclex_tutor_questions` gains the same column (parallel ownership
  model — see [bank.md](bank.md)).
- New table: `nclex_question_reports` (covers both QAcademy-owned
  and tutor questions via `item_id` + a source indicator, or via
  two separate tables if that is cleaner when building). Shape
  finalised in build, not planning.

### Deferred

- Reviewer workflow in admin (draft → reviewed → published).
- Report categories, auto-retirement thresholds, response-to-student
  notifications — all v2+ if they turn out to matter.
- Tutors contributing questions up into the main bank (mentioned in
  `bank.md` parallel ownership model — no UI for this in v1).

## Deferred (v2 or later)

- ~~Public self-serve tutor signup~~ — ✅ **built 2026-08-22**
  (tutor-onboarding slice 2). The **tutor marketplace UI** it was
  bundled with is still deferred.
- Automated payment splits between QAcademy and tutors
- Migration of MyNMCLicensure or MyTeacher onto this stack

## TBD (Not Yet Decided)

All planning topics settled as of 2026-04-20. Future topics will be
added here as they emerge.

## Related Files

- `mynclex/CLAUDE.md` — stack, conventions, non-negotiables
- `mynclex/docs/product-plan/` — all product-plan docs live here:
  - `main.md` — this file, the overall product plan and index
  - `bank.md` — full question-bank schema and scoring
  - `curriculum-authoring-ux.md` — tutor-side authoring screens and
    editors
  - `payments-and-enrolment.md` — student payment flows, product
    catalogue, and enrolment (both self-study and tutored)
  - `journey-tracker.md` — the Journey Tracker (third pillar):
    tutor↔student case management, configurable rich stages,
    stages-as-priced-services, access model
  - `tutor-library.md` — tutor's reusable teaching notes (BUILT;
    adds Library Note + Shelf as the 7th + 8th activity types, slices
    11.11 / 11.12)
  - `mockups/` — visual mockups (HTML reference files)
  - (future) `payments.md`, `registration.md`, etc.
- `mynclex/db/` — database schema, RLS, migrations (to be populated)
- `qacademy-gamma/SESSIONS.md` — running log of work across the repo
