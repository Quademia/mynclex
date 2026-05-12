# MyNclex — Tutor Library

*Living document. Part of the `mynclex/docs/product-plan/` set —
see [main.md](main.md) for the overall product plan.*
Last updated: 2026-05-11 (terminology sync with curriculum architecture
rework — attaches to **units** now, not weeks; rendered Week / Module
label is per the programme's `unit_label`, not derived from delivery
mode; cross-reference fixed from "Block types" → "Activity types";
terminology note added below to disambiguate two senses of "block".
Both delivery modes ship in v1.)

---

> **Terminology note — two senses of "block" in this doc.**
> "Block" is overloaded between this doc and the curriculum architecture:
> - **Editor block** *(the meaning used throughout this doc)* — a
>   typed unit inside a note's rich-text body (`paragraph`,
>   `heading`, `image`, `pdf`, `video`, `embedded_question`,
>   etc.). Notion / Editor.js sense. Authoring-time, scoped to a
>   single note.
> - **Curriculum block** *(defined in [main.md](main.md) → Programme
>   Structure)* — a workflow grouping of related activities under a
>   curriculum unit (e.g. PDF + quiz + tutorial wrapped as one
>   "Cardiac Pharmacology Block"). Curriculum-time, scoped to a
>   programme.
>
> Where this doc says "block" without qualification it always means
> the editor sense. Architectural blocks are written as "**curriculum
> block**" when they appear (e.g. when a Library Note attaches under
> a curriculum block as one of its activities).

---

## What this covers

A **per-tutor study-notes library** — reusable teaching content
authored by tutors, organised into folders, optionally attached to
programme units (rendered as Week N or Module N per the programme's
`unit_label`) as scheduled activities. Think "the tutor's lecture
notes for the platform": acid-base balance, endocrine system, how
to attack SATA questions, etc.

Sibling concept to the question bank: where the bank holds *practice*,
the library holds *teaching*. The two compose — a library note can
embed bank questions inline, turning a reading into a guided practice.

---

## Settled / open status

**Architectural shape settled 2026-05-08.** Schema sketched, scope and
visibility model locked, integration with programmes specified.

**Not queued for build.** This is a substantial feature (~4–6 weeks of
focused work — block-based editor is the heavy lift) with no users
blocking on it today. Parked until programmes, payments, and runner
finish ship. Revisit when one of: (a) a tutor pilot asks for it, or
(b) consumption work is complete and tutor-side differentiation is the
next priority.

**No QAcademy-side library in v1.** The decision to leave self-study
students with rationales-as-teaching is deliberate; the library is a
tutor differentiator. The schema parallels the bank's parallel-
ownership pattern, so a `nclex_library_*` (admin) twin can land later
without redesign if rationale quality proves insufficient.

---

## Why this exists

Self-study bank students currently get questions, rationales, per-
option feedback, history, and analytics. They get no first-class
teaching content beyond rationales. Tutored students get the same plus
their tutor's curriculum (Text / PDF / Link activities inside units).

The gap: tutors have **no reusable teaching surface**. A great article
on acid-base balance has to live as a Text activity inside a single
unit of a single programme. Run the same programme next term, the
tutor copy-pastes. Run a different programme, copy-paste again. No
catalogue, no reuse, no library.

The library closes this gap. A tutor authors content once; it lives
in their personal library; they reuse it across cohorts and
programmes, and students browse it as a structured study resource.

---

## Mental model

A tutor's library is **their lecture notes for the platform** — a
catalogue of reusable teaching content they build up over time and
draw on across all their cohorts.

Two distinct concepts that the design separates cleanly:

- **Visibility** — *who can read this note*. Governed by the note's
  `is_published` flag and a tutor-set visibility mode.
- **Scheduling** — *which programme treats this note as a tracked
  activity inside one of its units*. Governed by attaching the note
  to a specific programme/unit (as a loose Library Note activity, or
  inside a curriculum block).

These are independent axes. A note can be visible without being
scheduled (browseable in library, no unit assignment). A note can
be visible AND scheduled (browseable in library AND appears as a
tracked task in a specific unit). A note cannot be scheduled without
being visible — publishing is a precondition of attachment.

---

## Authoring (tutor side)

### Library home

Route: `/tutor/library/`. Sits alongside `/tutor/bank/` in the global
tutor sidebar.

Layout:
- Left rail: folder list, drag-to-reorder via up/down arrows
  (matching the unit-builder's reorder pattern).
- Main pane: notes inside the selected folder, listed with title,
  tags, last-edited timestamp, used-in count, status pill
  (Draft / Published).
- Top: tag filter strip + search box (title + body).
- Primary action top-right: **+ New note**.

### Folders

- **Flat, two-level structure** in v1: Folder → Note. No nesting.
  Two-level is enough for ~30 notes per tutor; nesting multiplies UI
  surface (move, breadcrumb, expand/collapse) for marginal benefit.
  Promote to nested in v2 if real tutors hit the limit.
- **Tutor-scoped namespace.** Two tutors can both have a folder
  called "Cardiac"; they don't see each other's. Enforced by
  `tutor_id` FK on the folder row.
- **Manual ordering** within the folder list via up/down arrows.
- A note can sit at the root (no folder) — `folder_id` is nullable.

### Note editor

Block-based rich-text editor at `/tutor/library/notes/[note_id]`.

Each note has:
- **Title** (text)
- **Folder** (dropdown of tutor's folders; or "(root)")
- **Tags** (free-text array, comma-separated input — same pattern as
  bank items)
- **Body** — JSONB block document (see Block types below)
- **Status** — Draft / Published
- **Visibility mode** — Tutor-wide / Programme-scoped (set at publish
  time, editable thereafter)

#### Block types

A note's body is a sequence of blocks. Each block has a type and its
own typed content. Mirrors the bank's polymorphic-content approach.

| Type | Purpose |
|---|---|
| `paragraph` | Rich-text prose with bold / italic / lists / inline links |
| `heading` | H2 / H3 sectioning |
| `image` | Inline image (uploaded to Supabase Storage) |
| `pdf` | Inline PDF embed (uploaded; rendered as embedded viewer) |
| `video` | External video link (YouTube / Vimeo / direct URL) |
| `embedded_question` | Inline interactive question — picks from the tutor's bank or QAcademy bank (provisional, see below) |

The embedded-question block is the differentiating feature. A note on
"How to attack SATA questions" embeds two real SATA questions inline
as guided practice — student reads, attempts, sees feedback, reads on.

### Edit-anytime model

A published note can be edited by the tutor at any time. Edits go
live immediately — no republish flow, no revision approval, no
holding edits back.

This matches the bank's pattern (`is_published` boolean + edits live
immediately + student session integrity via attempt-start snapshots).
Same trade-off: simplicity over revision-control. Promote to a
revision model in v2 if real tutors create chaos.

### Publishing

Publishing a note is a deliberate two-step:

1. Tutor clicks **Publish** on a draft.
2. A dialog asks: *Who can read this note?*
   - **Tutor-wide** *(default)* — any student enrolled in any of my
     programmes can see this note in their library.
   - **Programme-scoped** — only students in programmes I attach this
     note to can see it.

Default is Tutor-wide because foundational content (general teaching)
is the more common case. Programme-scoped is the deliberate choice for
cohort-specific content ("Cohort 5 — Week 3 study plan"). *(The
"Week 3" label depends on the programme's `unit_label` — a programme
that picked Module would say "Module 3" instead.)*

### Used-in count

Each note row shows a count of how many programme units it's attached
to. Clicking the count opens a list ("Bootcamp Cohort 5 — Week 3,
Pharm Intensive — Week 1") with deep links into each.

The count is **transparency on edit propagation**: when the tutor
saves changes to a note attached to 3 programmes with ~50 students
total, they should know what they're affecting. The save dialog shows
*"This note is attached to 3 programmes (~47 students). Your changes
will be visible immediately."*

---

## Visibility (who sees what)

| Note state | Who sees it |
|---|---|
| Draft | Only the tutor |
| Published, Tutor-wide | Every student enrolled in any of this tutor's programmes |
| Published, Programme-scoped | Only students in programmes the note is attached to (and only when those programmes are themselves published) |

A scenario:

> Tutor has three programmes running: Bootcamp Cohort 5, Bootcamp
> Cohort 6, Weekend Pharm Intensive.
>
> They publish "How to attack SATA questions" as **Tutor-wide**.
> Every student in all three programmes sees it in their library.
>
> They publish "Cohort 5 — Week 3 study plan" as **Programme-scoped**,
> attached only to Bootcamp Cohort 5 Week 3. Only Cohort 5 students
> see it. Cohort 6 doesn't (different cohort). Pharm Intensive
> doesn't (different programme).

### The combination case

A Tutor-wide note can ALSO be attached to a specific programme's
unit. Both states co-exist:

- All tutor's students see it in their library (Tutor-wide visibility).
- Bootcamp Cohort 5 students additionally see it as a scheduled
  activity in Week 3 (attachment — loose under the unit, or inside
  one of its curriculum blocks).

No content duplication — same note, two surfaces showing it.
Visibility and scheduling are independent axes, by design.

---

## Scheduling — Library Note as the 7th activity type

The unit-builder's add-activity picker grows from a 3×2 grid (six
types) to a 4×2 grid (or similar) including a new **Library Note**
type. This is documented as a structural revision to
[curriculum-authoring-ux.md](curriculum-authoring-ux.md) and
[main.md](main.md) (Programme Structure → Activity types).

### Adding a Library Note activity

1. Tutor clicks **+ Add activity** at the unit level (loose) OR
   **+ Add activity to block** inside a curriculum block.
2. Picker appears with 7 tile options. Tutor picks **Library Note**.
3. A modal opens showing the tutor's library — folders on the left,
   notes on the right, search + tag filter.
4. Tutor picks one note; the modal closes and the note slots in
   loose under the unit (or into the curriculum block, depending on
   which entry point fired the picker) as an activity.

The activity row shows: type icon, note title, optional tutor-set
caption ("Read before Wednesday's session"), and the standard
up/down arrows for reordering.

### Single source of truth

Attaching is a *pointer*, not a copy. The attachment row stores
`{note_id, programme_id, unit_id, block_id (nullable), position}` —
nothing else. The actual content lives once, in
`nclex_tutor_library_notes`.

When the tutor edits the master note, every attachment renders the
updated content immediately. There is no "per-attachment copy" model
in v1. Confirmed call: it would feel wrong if editing your acid-base
notes left stale copies scattered across old cohorts.

### Visibility precondition

A note can only be attached to a unit if it is published. Draft
notes don't appear in the attach modal.

Attaching a Programme-scoped note to a programme grants visibility to
that programme's students automatically — no separate "make visible"
step.

### Detach / delete behaviour

- **Detaching** a note from a unit removes the activity row but
  leaves the master note untouched in the library.
- **Deleting** a master note is refused if it's attached anywhere
  (`ON DELETE RESTRICT`). The tutor must detach all attachments first.
  Same pattern as Trend datasets in the bank.
- **Unpublishing** a note that's attached: the note becomes invisible
  again (back to draft state), the attachments stay in place but
  render a "Note hidden by tutor" placeholder. Tutor can republish
  to restore.

---

## Student side

### Programme library surface

Route: most likely `/student/programme/[programme_id]/library/`
(exact path TBD at build time).

The student sees the union of:
- All Tutor-wide published notes from this programme's tutor(s)
- All Programme-scoped notes attached to this programme

Both sets are merged into a single library view. Folder structure as
authored by the tutor is preserved on the student side — students see
"Cardiac", "Pharm", "Test-taking strategies" as the tutor laid them
out. Tags are exposed as filters.

**Landing UX deferred to build time.** The intent is "a proper
library" — topic-organised, browseable, more substantial than a flat
file list. Whether that's topic tiles, course-style chapters,
shelves, or something else is a UI decision the schema doesn't
constrain. Folders + tags + search is enough to support any of those.

### Reading a note

A read-only renderer (separate component from the editor) renders
the note's block document in student-facing mode:
- `paragraph` / `heading` / `image` / `pdf` / `video` blocks render
  as one would expect.
- `embedded_question` blocks render as **interactive practice**:
  student answers, sees right/wrong + per-option feedback +
  rationale, reads on. Same per-question-runner components as the
  main runner uses (with a `mode="library_embed"` variant).

### Scheduled vs unscheduled appearance

- Notes attached to a unit of an enrolled programme also appear in
  that **unit's activity list** as a tracked task with completion
  tick (passive content — student-ticked, not auto-completed unless
  the note contains embedded questions, in which case completion
  rules per programme structure apply). When attached inside a
  curriculum block, the note participates in that block's done
  rollup like any other in-block activity.
- Notes only visible via Tutor-wide (not attached) appear in the
  library only — not in any unit's activity list.

The mental model: library = "what's available to read." Unit
activities = "what your tutor wants you to read this unit." Same
content surface in two contexts.

---

## Embedded bank questions — provisional

This is the most ambitious part of the feature, and the most likely
to slip if the runner reuse turns out painful. Treated as
**provisional** — planned, may be cut from the first build of the
library if integration cost is high.

### Mechanics

A note's body can include `embedded_question` blocks. Each block
references a single bank item by `item_id` (tutor-private question
or QAcademy-shared question — same picker pattern as Practice quiz
activities use).

When the student reads the note and reaches an embed:
- The question renders in answering mode.
- Student answers. Submit fires.
- Student sees right/wrong + per-option feedback + rationale.
- Reading continues.

### Attempt-tracking — does NOT count toward student analytics

Settled. A student's attempt on an embedded question:
- Does **not** count toward their main practice analytics
- Does **not** affect their pool state (Unseen → Seen, Correct/Incorrect)
- Does **not** appear in their question history
- Does **not** affect Readiness Signal or any other analytic surface

Implementation: a new value on `nclex_attempts.source` —
`LIBRARY_EMBED` — which the analytics queries simply ignore. Or a
separate lightweight table for note-embedded answers if the runner's
attempt-creation path is too constrained to extend cleanly.
Build-time call.

The reason: a note-embedded question is a teaching interaction, not
a quiz. Polluting analytics with one-off embed answers would distort
the student's signal. They might re-read a note three times to study;
their pool state shouldn't shift.

### Tutor-side analytics — v2+, schema-supported from day one

Once tutor analytics arrives, the same `source = 'LIBRARY_EMBED'`
rows become a powerful signal for tutors: *"80% of students failed
the SATA in my acid-base note"* is exactly the kind of teaching
insight that justifies the feature. The schema is shaped right for
this from day one.

### Open question — snapshot at submit time

If a tutor edits a note (or the embedded question itself) while a
student is mid-read, what do they see? For text content, immediate
visibility is fine — even desirable. For embedded questions where a
student has already submitted an answer, the *content + correct*
snapshot at submit time may need to be preserved.

Build-time concern. Likely solution: same snapshot pattern the
runner already uses for `nclex_attempt_items`.

### Question deletion behaviour

A bank question embedded in any note cannot be deleted from the
bank. `ON DELETE RESTRICT` on the embed reference. Tutor must
remove the embed from all notes before deleting the question.

Same pattern as Case Study children and Trend dataset children.

---

## Schema sketch

Three new tables. Names follow the `nclex_tutor_*` prefix convention
of the existing parallel-ownership tutor side.

```
nclex_tutor_library_folders
  folder_id          TEXT PK
  tutor_id           UUID FK -> nclex_users(id) ON DELETE CASCADE
  name               TEXT NOT NULL
  position           INTEGER NOT NULL DEFAULT 0   -- folder sort order
  created_at         TIMESTAMPTZ DEFAULT NOW()
  updated_at         TIMESTAMPTZ DEFAULT NOW()

nclex_tutor_library_notes
  note_id            TEXT PK
  tutor_id           UUID FK -> nclex_users(id) ON DELETE CASCADE
  folder_id          TEXT FK -> nclex_tutor_library_folders ON DELETE SET NULL
                     -- nullable; null = root-level note
  title              TEXT NOT NULL
  body               JSONB NOT NULL DEFAULT '[]'::jsonb
                     -- array of typed blocks
  tags               TEXT[] NOT NULL DEFAULT '{}'
  position           INTEGER NOT NULL DEFAULT 0   -- order within folder
  is_published       BOOLEAN NOT NULL DEFAULT FALSE
  visibility_mode    TEXT NOT NULL DEFAULT 'TUTOR_WIDE'
                     CHECK (visibility_mode IN ('TUTOR_WIDE','PROGRAMME_SCOPED'))
  created_at         TIMESTAMPTZ DEFAULT NOW()
  updated_at         TIMESTAMPTZ DEFAULT NOW()

nclex_tutor_library_note_attachments
  attachment_id      TEXT PK
  note_id            TEXT FK -> nclex_tutor_library_notes ON DELETE RESTRICT
  programme_id       TEXT FK -> nclex_programmes ON DELETE CASCADE
  unit_id            TEXT FK -> nclex_programme_units ON DELETE CASCADE
  block_id           TEXT FK -> nclex_programme_blocks ON DELETE CASCADE
                     -- nullable; null = loose under unit, set = inside a curriculum block
  position           INTEGER NOT NULL DEFAULT 0   -- order within parent (unit or block)
  caption            TEXT                          -- nullable; tutor's "Read before Wednesday" annotation
  created_at         TIMESTAMPTZ DEFAULT NOW()
```

> **Schema note (curriculum architecture rework, 2026-05-11).** The
> attachment row's curriculum FKs were updated from `week_id` /
> `module_id` to `unit_id` / `block_id` (nullable). This matches
> the new generic-units + optional-blocks model. The exact table
> names (`nclex_programme_units`, `nclex_programme_blocks`) are
> placeholders — the canonical names get fixed in the slice 9.x
> programme schema work; this doc will inherit whatever lands there.

Body shape (JSONB):

```
[
  { "type": "heading", "level": 2, "text": "Acid-base balance" },
  { "type": "paragraph", "text": "..." },
  { "type": "image", "url": "...", "alt": "..." },
  { "type": "embedded_question", "item_id": "NCLEX_SATA_00012", "source": "BANK" },
  { "type": "paragraph", "text": "..." }
]
```

Block types extend additively — adding a new block type is a
schema-free change (just teach the editor and renderer about it).

### RLS policies (sketch)

- `nclex_tutor_library_folders`: tutor sees own; SUPER_ADMIN bypass.
- `nclex_tutor_library_notes`: tutor sees own (any state); enrolled
  students see published notes per visibility rules; SUPER_ADMIN bypass.
- `nclex_tutor_library_note_attachments`: tutor sees own; enrolled
  students see attachments for their programmes; SUPER_ADMIN bypass.

The student-visibility rule is the non-trivial one. Likely shape: a
helper function `nclex_student_can_see_note(note_id)` that combines
enrolment, visibility_mode, and attachment checks. Build-time detail.

---

## Build size estimate

Realistic: **4–6 weeks of focused work** for v1.

| Stage | Size |
|---|---|
| Schema + RLS + helper functions | ~1 week |
| Library list + folder management (tutor side) | ~3 days |
| Note editor — block-based rich text + media uploads | **2–3 weeks** (heavy lift) |
| Embedded-question block + picker | ~1 week (depends on runner reuse) |
| Programme integration — 7th activity type, attach modal, used-in count | ~1 week |
| Student read-mode renderer | ~3 days |
| Student library landing UX (the "proper library" feel) | ~1 week (design pass first) |

Comparable in scope to a single Case Study or Trend wrapper build
(slices 12 / 13). The block editor is the single biggest unknown.

---

## What's NOT in v1

Tracking deliberately deferred:

- **QAcademy-side library** — admin-authored notes for self-study
  bank students. Schema-parallel; can land later without redesign.
- **Nested folders** — flat two-level (Folder → Note) is enough.
- **Per-attachment content variants** — single-source-of-truth only.
- **Tutor-side analytics on embedded questions** — schema supports it
  via `source = 'LIBRARY_EMBED'`; UI is v2+.
- **Revision history / draft-of-published edits** — edit-anytime
  goes live immediately.
- **Co-tutor edit conflict handling** — low priority for v1 cohort
  sizes.
- **Student annotations / highlights / personal notes on tutor
  notes** — read-only on the student side in v1.
- **Comments / questions on notes** — no discussion surface.
- **Export / print / offline reading** — read in-browser only.
- **Cross-tutor sharing** — every tutor's library is private to them.

---

## Build order (when this gets queued)

Suggested sequence, smallest verifiable slice first:

1. **Schema + RLS** — three tables + policies + helper function for
   student visibility. Verify with seeded SQL before any UI.
2. **Library list page (tutor side)** — folders + notes list +
   create-note + create-folder. Body editor is a single textarea
   placeholder for now. Ship before the block editor lands.
3. **Block editor — paragraph + heading + image** — the three core
   block types. Get the editor framework right before adding more
   types.
4. **Block editor — pdf + video** — additive.
5. **Publish flow + visibility mode + status pills** — wire the
   draft/published states end-to-end.
6. **Programme integration** — Library Note as 7th activity, attach
   modal, detach, used-in count.
7. **Student read-mode renderer** — non-interactive blocks first
   (everything except embedded questions).
8. **Embedded question block** — picker in editor + interactive
   render in student mode + `LIBRARY_EMBED` attempt path.
9. **Student library landing page** — design pass + build the
   "proper library" UX.
10. **Polish** — search, tag filtering, used-in click-through, save
    dialogs, the lot.

Provisional gate after step 3 — if the block editor is going badly,
fall back to a simpler textarea-with-markdown approach for v1 and
defer the rich block editor to v2. The library is still useful with
plain markdown.

---

## Cross-references — TODO

When this feature gets queued for build, three other planning docs
need updating:

- **[main.md](main.md) — Programme Structure → Activity types.** Add
  Library Note as the 7th activity type. Move it from "deferred" to
  "v1" if/when the library ships.
- **[curriculum-authoring-ux.md](curriculum-authoring-ux.md) —
  Activity editors.** Add Library Note as the 7th editor in the table
  (Type / Fields columns). Note that the editor is "pick from
  library" not "edit inline."
- **`docs/product-plan/tutor-nav.html`** — programme sidebar may
  want a Library entry alongside Curriculum, Live Sessions, etc.,
  for the tutor's quick access into their own library from inside a
  programme context.

These edits are deferred until the feature is actually queued, to
avoid promising something that may slip again.

---

## Open questions deferred to build

- Student library landing UX (the "proper library" feel — topic
  tiles / shelves / chapters / something else)
- Embedded-question snapshot policy for in-flight reads when the
  tutor edits mid-read
- Whether `nclex_attempts.source = 'LIBRARY_EMBED'` is the right
  shape vs a separate lightweight table for note-embedded answers
- Concurrent-edit conflicts between co-tutors on a shared note
- Whether to fold Text and PDF activity types into Library Note
  (decided: leave alone for now, revisit if the redundancy bites)

---

## Related

- [main.md](main.md) — overall product plan; Programme Structure
  defines the activity-type registry this feature extends.
- [curriculum-authoring-ux.md](curriculum-authoring-ux.md) — the
  unit-builder UI this feature plugs into (loose-or-in-block
  attachment).
- [bank.md](bank.md) — the question bank that embedded-question
  blocks reference.
- [payments-and-enrolment.md](payments-and-enrolment.md) — the
  enrolment that grants student visibility to the library.
- `mynclex/CLAUDE.md` — stack, conventions, parallel-ownership
  pattern that this feature mirrors.
