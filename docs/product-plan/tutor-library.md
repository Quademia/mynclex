# MyNclex — Tutor Library

*Living document. Part of the `mynclex/docs/product-plan/` set —
see [main.md](main.md) for the overall product plan.*
Last updated: 2026-05-16 (architectural pivot + editor-side sync —
**visibility now lives on the note**, not on shelves; folders, shelves,
views, pillars and tags are pure organisational tools; **shelves**
added as a curated-pack lens; **NCLEX pillars** added as first-class
single-primary classification; mockup synced; student side mirrors
tutor structure with read-only adaptations and visibility-filtered
counts; **8 activity types** — Library Note + Shelf join the existing
six; **editor side fully specified** — Tiptap framework chosen, 12
block types in 4 groups (Drug card + Lab values extensible from day
one), editor UX + keyboard shortcuts + autosave locked, embedded
questions tutor-bank-only with answers in dedicated table
`nclex_library_embed_answers` (not `nclex_attempts`); read-mode
renderer specified end-to-end. Earlier sync 2026-05-11 — attaches to
**units** not weeks; rendered label per programme's `unit_label`.)

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
authored by tutors, organised across **five lenses** (folders,
shelves, pillars, tags, views), optionally attached to programme
units (rendered as Unit N or Module N per the programme's
`unit_label`) either as single notes or as whole curated shelves.
Think "the tutor's lecture notes for the platform": acid-base
balance, endocrine system, how to attack SATA questions, etc.

Sibling concept to the question bank: where the bank holds
*practice*, the library holds *teaching*. The two compose — a
library note can embed bank questions inline, turning a reading into
a guided practice. Both classify under the same NCLEX Client Needs
pillars, so a tutor can see at a glance whether their library
coverage matches their bank coverage by pillar.

---

## Settled / open status

**Architectural shape settled 2026-05-08, refined 2026-05-16.** Schema
sketched, visibility model locked **at the note level** (see below),
five organising lenses defined, integration with programmes specified.
Mockup at `docs/product-plan/mockups/tutor-library-mockup.html` reflects
the current architecture and is the source of truth for the UI.

**Visibility lives on the note.** Two values: `TUTOR_WIDE` (every
student of this tutor sees it) and `PROGRAMME_SCOPED` (only students in
the specific programme/cohort see it). **Folders, views, shelves,
pillars and tags do not gate visibility** — they are pure organisational
tools. Students see the same organising structure as the tutor, just
visibility-filtered.

**Five organising lenses** (see [Organising lenses](#organising-lenses)
below):

- **Folders** — tutor's primary filing bin (1 per note)
- **Shelves** — curated cross-cutting packs (many per note)
- **Pillars** — NCLEX Client Needs classification (1 per note, 8
  sub-categories)
- **Tags** — free-form attributes (many per note)
- **Views** — derived/saved queries

**Not queued for build.** Substantial feature (~5–7 weeks of focused
work with the shelves and pillars additions — block-based editor is
still the heavy lift) with no users blocking on it today. Parked until
programmes, payments, and runner finish ship. Revisit when one of:
(a) a tutor pilot asks for it, or (b) consumption work is complete and
tutor-side differentiation is the next priority.

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

Three orthogonal concepts the design separates cleanly:

- **Visibility** — *who can read this note*. A property of the **note
  itself**: `is_published` flag + visibility mode (`TUTOR_WIDE` or
  `PROGRAMME_SCOPED`). Not derived from folders, shelves, or any
  organisational container.
- **Organisation** — *how the tutor finds and groups their content*.
  Five lenses (folders, shelves, pillars, tags, views), each playing
  a distinct role. None of these affect who can read a note.
- **Scheduling** — *which programme treats this note as a tracked
  activity inside one of its units*. Governed by attaching the note
  (or a shelf, see [Scheduling](#scheduling--library-note-and-shelf-as-the-7th--8th-activity-types))
  to a specific programme/unit.

These are independent axes. A note can be visible without being
scheduled (browseable in library, no unit assignment). A note can be
visible AND scheduled (browseable in library AND appears as a tracked
task in a specific unit). A note cannot be scheduled without being
visible — publishing is a precondition of attachment.

**What students see.** Students see the same organisational structure
as the tutor — same folders, same shelves, same pillar list, same tag
cloud — but the *contents* of each container are filtered to notes the
student has access to. A folder of 7 for the tutor might show 3 to a
student in Cohort 5 (the other 4 are scoped to other cohorts). Empty
containers are hidden from the student's sidebar entirely. Sidebar
counts are viewer-relative.

---

## Authoring (tutor side)

### Library home

Route: `/tutor/library/`. Sits alongside `/tutor/bank/` in the global
tutor sidebar.

**Chrome — five-lens sidebar.** The library home has a secondary left
rail (inside the page, not a new global nav entry) carrying all five
organising lenses, top to bottom: **Views**, **Folders**, **Shelves**,
**Pillars**, **Tags**. Each section is collapsible; counts are shown
per entry. A top-bar dropdown chrome was evaluated as a v2 alternative
— see the [mockup](mockups/tutor-library-mockup.html) screen 3
"Library home — folder scope (top-bar variant)". Decision: **sidebar
default**, with collapse-to-icons as a future affordance for narrow
viewports.

**Folders + Shelves sections each carry an "All folders" / "All
shelves" top entry** that opens a zoomed-out view of the lens (folder
cards grid for All folders; Spotify-style horizontal carousels per
shelf for All shelves). These are navigation aids — they're the
landing surface when the tutor wants to browse the lens rather than
drill into a specific container.

**Main pane structure** (folder or shelf scope):
- Crumb (`Folder / Cardiac` or `Shelf / Foundational SATA pack`)
- Title row + lens badge (`Folder` or `Shelf · curated`)
- Sub-line (count + clarifying copy)
- Filter bar (tag chips + `+ nclex_*` action)
- Notes list with the **per-note lens row** — each note's title,
  subtitle (when set), `description` (or an auto-excerpt of `body`
  when description is null), and a single line below carrying all
  memberships inline: 📁 folder · 📚 shelf pip(s) · pillar chip ·
  \# tags. Right column carries status (`Pub` / `Draft`), `↳ used in
  N` pill, last-edited timestamp.

The per-note lens row is the single most important UI element on the
library home — it makes the m:n classification model legible at a
glance.

**Toolbar:** search input + `+ New folder` + `+ New note`. Primary
actions live at the top, above the lens bar / sidebar split.

### Folders

- **Tutor's primary organising bin.** Exactly one folder per note.
  Folders are a navigation tool; they do not gate visibility.
- **Flat, two-level structure** in v1: Folder → Note. No nesting.
  Two-level is enough for ~30 notes per tutor; nesting multiplies UI
  surface (move, breadcrumb, expand/collapse) for marginal benefit.
  Promote to nested in v2 if real tutors hit the limit.
- **Tutor-scoped namespace.** Two tutors can both have a folder
  called "Cardiac"; they don't see each other's. Enforced by
  `tutor_id` FK on the folder row.
- **Manual ordering** within the folder list via up/down arrows.
- A note can sit at the root (no folder) — `folder_id` is nullable.
- **Students see the tutor's folders** with their own visibility
  slice. A folder of 7 notes for the tutor may show 3 to a Cohort 5
  student; empty folders are hidden from the student's sidebar.

### Shelves

Curated cross-cutting packs. A note can sit on many shelves; a shelf
can hold many notes. Shelves do not gate visibility — see
[Visibility](#visibility-who-sees-what).

- **Why they earn their keep.** Folders are 1:N — a note has exactly
  one folder. That's not enough granularity for the "I want to group
  notes across folders into a curated pack" workflow. Examples:
  *"Foundational SATA pack"* spans Test strategies + Cardiac folders;
  *"Drug deep dives"* spans Pharm + Cardiac + Endocrine.
- **Each shelf has a colour.** Used as the rail-side dot in the
  sidebar, the pip in the per-note lens row, the outer border when
  the shelf is attached to a unit (see
  [Scheduling](#scheduling--library-note-and-shelf-as-the-7th--8th-activity-types)),
  and the dot on the All-shelves carousel section header. Identity
  travels with the shelf wherever it appears.
- **No visibility on the shelf itself.** A shelf is a pure
  organisational container. Its visibility (to whom) is computed at
  read time from the membership: a shelf is visible to a student if
  any of its notes are visible to that student.
- **All shelves view** (`/tutor/library/?lens=shelves`) lays out
  shelves as Spotify-style horizontal carousels — one section per
  shelf with colour dot + title + count + tagline at the top, then a
  row of note cards (title + subtitle when set + `description` or
  body-excerpt fallback + pillar chip + tags), ending in a dashed
  `+ Add to shelf` slot.

### NCLEX Pillars

The canonical NCLEX-RN Client Needs classification — every bank
question is classified by it, and the test plan distributes exam
items by it. Notes carry the same classification, so the library
becomes pillar-balanced study material.

- **8 sub-categories** (the Client Needs sub-level — the grain at
  which bank items are classified):
  - `MoC` Management of Care
  - `SIC` Safety & Infection Control
  - `HPM` Health Promotion & Maintenance
  - `PI` Psychosocial Integrity
  - `BCC` Basic Care & Comfort
  - `PPT` Pharmacological Therapies
  - `ROR` Reduction of Risk Potential
  - `PA` Physiological Adaptation
- **Single primary pillar per note in v1.** One field, one chip.
  Stored as `domains: string[]` (array shape for forward compat) but
  required length = 1 in v1. Promote to many in v1.5 without a
  migration if real tutors hit "this note legitimately covers two
  pillars."
- **Surfaced two ways**: as a 5th sidebar section (8 entries with
  short codes + counts) and as a coloured chip in every per-note
  lens row. The chip carries the daily load; the sidebar lens is for
  occasional pillar-browsing.
- **Top-level pillars (4) are derived**, not stored — the 8
  sub-categories roll up into Safe & Effective Care Environment,
  Health Promotion & Maintenance, Psychosocial Integrity, and
  Physiological Integrity. No expand/collapse in the sidebar; the
  flat 8-entry list is short enough to scan directly.

### Views

Derived/saved queries on the tutor's library. Three system defaults
ship; tutors can add custom views in v1.5.

- **System views (v1):** *All notes*, *Recent*, *Drafts*, *Used
  nowhere* (orphans — notes with no programme attachment).
- **Custom views (v1.5):** saved filter combos like *"Stale but still
  in use"* (`edited > 60d AND attached somewhere`) or *"Cohort 5"*
  (notes tagged `cohort-5`). No query language to invent — the
  filter chips on the main toolbar are the building blocks.
- **Student-side views differ.** Students don't get *Drafts* or
  *Used nowhere* — they get *For this unit* and *Bookmarked*
  instead.

### Note editor

Block-based rich-text editor at `/tutor/library/notes/[note_id]`,
built on **[Tiptap](https://tiptap.dev)** (ProseMirror under the hood,
MIT-licensed, React-first). Tiptap's extension model + JSON output
match our typed-block + JSONB storage needs cleanly. Custom NCLEX-
domain blocks (Callout, Drug card, Lab values, Embedded question) are
React node components registered as ProseMirror nodes. Markdown
fallback is the build-time escape hatch if the editor work runs over.

Each note carries:

| Field | Notes |
|---|---|
| **Title** (text) | Required. Auto-saved. |
| **Folder** (FK) | The tutor's primary bin. Nullable (root-level note). |
| **Tags** (text array) | Free-form, comma-input. NCLEX-pillar `nclex_*` tags pre-seeded. |
| **Pillar** (enum) | NCLEX Client Needs primary category. One of 8 sub-categories. Required at save. |
| **Body** (JSONB block document) | Sequence of typed blocks — see Block types below. |
| **Status** | Draft / Published. |
| **Visibility mode** | Tutor-wide / Programme-scoped — set at publish time, editable thereafter. |
| **Scoped programme** (FK) | Required when visibility = Programme-scoped; nullable otherwise. |

#### Editor UX

**Block insertion — three entry points**:
- **Slash command** (`/`) anywhere in the document opens a filtered block menu. Type to narrow (`/dr` → Drug card).
- **`+` button** between blocks (hover affordance) — same menu.
- **Permanent "+ Add block" button** at the foot of the editor — same menu.

All three open the same block-picker popover (12 types grouped into Text & structure, Visual & media, Nursing-shaped, Interactive).

**Block reordering** — drag handle (`⋮⋮`) on the left of a hovered/focused block. Alt+↑ / Alt+↓ keyboard shortcut as an accessibility equivalent.

**Block actions** — kebab menu (`⋮`) on a hovered/focused block, top-right of the block. Actions: Delete, Duplicate, Convert (text blocks only — Paragraph ↔ Heading ↔ Quote ↔ List). Domain blocks (Drug card, Lab values, Callout) cannot be converted to/from other types — they have structured schemas.

**Inline formatting toolbar** — always visible at the top of the editor, not floating. Marks: bold, italic, underline, strikethrough, inline code, link. Keyboard shortcuts mirror the toolbar (Cmd/Ctrl+B / I / U / Shift+S / E / K).

**Keyboard shortcuts** (locked):
- `Cmd/Ctrl+B/I/U`, `Cmd/Ctrl+Shift+S`, `Cmd/Ctrl+E`, `Cmd/Ctrl+K` — inline marks + link
- `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` — undo / redo
- `Cmd/Ctrl+Enter` — insert new block below
- `Alt+↑` / `Alt+↓` — move current block up/down
- `Backspace` at start of empty block — delete block, focus previous
- `/` — open block menu
- `Cmd/Ctrl+Shift+1/2` — convert to H2 / H3
- `Cmd/Ctrl+Shift+8/9` — convert to bulleted / numbered list

**Autosave** — every 3 seconds of inactivity (debounced). Indicator in the editor's top-right: *"Saving…"* during write, *"Saved 3s ago"* at rest, *"Unsaved changes"* on failure. No explicit Save button. Publish button stays separate (it's the visibility-mode flip, not save).

**Edit-propagation warning** — on the first significant save after 5+ minutes of inactivity (a "session break"), the save dialog surfaces the propagation reach: *"This note is attached to 3 programmes (~47 students). Your changes are now visible."* Subsequent autosaves within the session don't re-show the warning. "Significant" = block added/removed/converted, embedded question changed, drug-card fields edited — not micro-edits (typos, formatting).

#### Block types

A note's body is a sequence of blocks. Each block has a type and its
own typed content. Mirrors the bank's polymorphic-content approach.
**12 block types in 4 groups** (synced with
`docs/product-plan/mockups/tutor-library-mockup.html`):

##### Group 1 — Text & structure

| Type | Schema | Authoring notes |
|---|---|---|
| `heading` | `{ type, level: 2\|3, text }` | H2 + H3 only — no H4. |
| `paragraph` | `{ type, content: [{ text, marks: [...] }] }` | Inline marks: bold / italic / underline / strikethrough / code / link. |
| `list` | `{ type, kind: "bulleted"\|"numbered", items: [...] }` | One level of nesting (Tab / Shift+Tab). |
| `quote` | `{ type, content, citation? }` | Block quote with optional citation line. |

##### Group 2 — Visual & media

| Type | Schema | Authoring notes |
|---|---|---|
| `image` | `{ type, asset_id, alt, caption? }` | Alt text **required**. 5MB cap, auto-resize to 1600px width on upload. Supabase Storage, signed URLs on-demand. |
| `pdf` | `{ type, asset_id, title, caption? }` | Same storage strategy as Image. Renders as a **link card with "Open" button** (not inline iframe — inline embeds are unreliable across browsers). |
| `video` | `{ type, url, provider, caption? }` | External embeds only — YouTube + Vimeo + Loom in v1. Direct MP4 URLs render via `<video>`. No self-hosting. |
| `table` | `{ type, header_row: bool, cells: [[...], ...] }` | Generic comparison table. Rich-text cell contents (bold / italic / link within a cell). No images in cells in v1. Standard add/remove row/column controls. **First to defer if editor work runs over.** |

##### Group 3 — Nursing-shaped (the differentiators)

**Callout**
- Tinted box for emphasis. **5 tones**, each with a default icon + label: *Note* (ℹ), *Tip* (💡), *Warning* (⚠), *Critical* (⛔), *Memory* (🧠).
- Schema: `{ type: "callout", tone: "note"|"tip"|"warning"|"critical"|"memory", content }`
- No custom title (title derives from tone — keeps the scannable tone-vocabulary intact).
- Content is paragraph-like rich text. No nested blocks (a callout is emphasis, not a container).

**Drug card** — *extensible from day one*
- Header: drug name (required) + drug class (optional).
- Body: ordered array of `{ label, value }` fields. New cards pre-populate with the 4 NCLEX-canonical fields: *Indications · Typical dose · Side effects · Nursing considerations*. Tutor can rename, reorder, add, or remove fields.
- Field values are plain text, multi-line (line breaks render as breaks). No inline marks.
- Schema:
  ```json
  {
    "type": "drug_card",
    "name": "Furosemide",
    "drug_class": "Loop diuretic",
    "fields": [
      { "label": "Indications",           "value": "Heart failure, oedema, hypertension" },
      { "label": "Typical dose",           "value": "20–80 mg PO/IV daily" },
      { "label": "Side effects",           "value": "Hypokalaemia, ototoxicity, hypotension" },
      { "label": "Nursing considerations", "value": "Monitor K⁺, BP, daily weight, I&O" }
    ]
  }
  ```
- Authoring: per-field row with `label` input + `value` textarea + drag handle + remove. `+ Add field` button at foot.
- Validation: `name` required; at least one field with content; field labels required.
- Not linked to bank items in v1.

**Lab values** — *extensible columns from day one*
- Title (required — e.g. "Arterial Blood Gas (ABG)") + flexible columns + rows.
- New tables pre-populate with the 4 NCLEX-canonical columns: *Test · Normal · If high · If low*. Tutor can rename, reorder, add, or remove columns.
- Schema:
  ```json
  {
    "type": "lab_values",
    "title": "Arterial Blood Gas (ABG)",
    "columns": [
      { "label": "Test" }, { "label": "Normal" },
      { "label": "If high" }, { "label": "If low" }
    ],
    "rows": [
      ["pH",    "7.35–7.45",  "Alkalosis",            "Acidosis"],
      ["PaCO₂", "35–45 mmHg", "Respiratory acidosis", "Respiratory alkalosis"]
    ]
  }
  ```
- Authoring: standard column-add/remove + row-add/remove. **Column removal warns** ("This will delete the values in this column for all N rows. Continue?").
- Validation: title required; ≥1 column; ≥1 row; column labels required.

##### Group 4 — Interactive

**Embedded question** — *the killer feature*
- Schema: `{ type: "embedded_question", item_id, source: "TUTOR" }`
- Picks **from the tutor's own bank only** — not from the QAcademy bank (editorial control + attribution clarity + cross-ownership deletion concerns). Source field retained as forward-compat enum; v1 only allows `TUTOR`.
- **Edit mode rendering** — a reference card (not the live question): `Question TUTOR_SATA_00012 · SATA · 4 options · Cardiac · PA chip` + "Open in bank" link. Reduces editor visual clutter; the tutor already knows the question.
- **Read mode rendering** — interactive practice (see [Read-mode renderer](#read-mode-renderer) below).
- Question types in v1: MCQ + SATA + TF. NGN types deferred at the product level per `mynclex/CLAUDE.md`.
- Multiple embeds of the same question in the same note allowed (per-occurrence).
- Soft cap of **20 embeds per note** (at-save prompt: "Are you sure?"); hard cap 50.
- Only Published bank questions are embeddable. Drafts don't appear in the picker.
- **Empty-state**: when a brand-new tutor with zero published bank questions opens the block menu and picks Embedded question, show an empty-state message with a deep link to their bank editor.
- **Question deletion**: `ON DELETE RESTRICT` on the embed reference — the tutor must remove the embed from every note before deleting the question.

#### Storage strategy (Image + PDF blocks)

**On-demand signed URLs**. Same pattern as the PDF activity (Slice 10.4). When the editor or read view renders an Image/PDF block, the server mints a short-lived signed URL pointing at the Supabase Storage object. No long-lived URLs stored in the JSONB — only the `asset_id` (Storage path or bucket-relative key).

Trade-off: extra DB query per image render, but:
- Library content is paid (only enrolled students see it)
- Mirrors PDF-activity machinery — no new pattern
- Image-heavy notes batch-mint per page render, not per-image network round-trip

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
   - **Programme-scoped** — pick one programme; only students in that
     programme see it.

Default is Tutor-wide because foundational content (general teaching)
is the more common case. Programme-scoped is the deliberate choice for
cohort-specific content ("Cohort 5 — Unit 3 study plan"). *(The
"Unit 3" label depends on the programme's `unit_label` — a programme
that picked Module would say "Module 3" instead.)*

Visibility is set per-note. Folders, shelves, pillars, tags, and views
do not affect it — they are pure organisational tools.

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

Visibility is a property of the **note**, not of any organisational
container. Two values, set when the tutor publishes:

| Note state | Who sees it |
|---|---|
| Draft | Only the tutor |
| Published, **Tutor-wide** | Every student enrolled in any of this tutor's programmes |
| Published, **Programme-scoped** | Only students in the specific programme the note is scoped to (and only when that programme is itself published) |

A scenario:

> Tutor has three programmes running: Bootcamp Cohort 5, Bootcamp
> Cohort 6, Weekend Pharm Intensive.
>
> They publish "How to attack SATA questions" as **Tutor-wide**.
> Every student in all three programmes sees it in their library.
>
> They publish "Cohort 5 — Unit 3 study plan" as **Programme-scoped
> to Bootcamp Cohort 5**. Only Cohort 5 students see it. Cohort 6
> doesn't (different cohort). Pharm Intensive doesn't (different
> programme).

### Containers don't gate visibility

A note's folder, shelf, pillar, or tags do not affect who can see it.

- A folder can contain a mix of Tutor-wide and Programme-scoped notes.
  Different students see different slices of the same folder. A
  folder of 7 for the tutor might show 3 to a Cohort 5 student.
- A shelf can contain a mix similarly. The same student-side counts
  apply.
- Empty containers (zero visible notes for this student) are hidden
  from the student's sidebar automatically — only containers with at
  least one visible note appear.
- Sidebar counts are viewer-relative.

### The combination case

A Tutor-wide note can also be attached to a specific programme's
unit. Both surfaces co-exist:

- All this tutor's students see it in their library (Tutor-wide
  visibility).
- Bootcamp Cohort 5 students additionally see it as a scheduled
  activity in Unit 3 (attachment — loose under the unit, or inside
  one of its curriculum blocks).

No content duplication — same note, two surfaces showing it.
Visibility and scheduling are independent axes, by design.

A Programme-scoped note can only be attached to units in the same
programme. Attempting to attach it elsewhere is refused.

---

## Scheduling — Library Note and Shelf as the 7th + 8th activity types

The unit-builder's add-activity picker grows from a 3×2 grid (six
types) to a 4×2 grid with **two new types**: **Library Note** (a
single reusable note) and **Shelf** (a whole curated pack — every note
on the shelf becomes a row). Both flagged NEW in the picker. This is
documented as a structural revision to
[curriculum-authoring-ux.md](curriculum-authoring-ux.md) and
[main.md](main.md) (Programme Structure → Activity types).

### Adding a Library Note activity

1. Tutor clicks **+ Add activity** at the unit level (loose) OR
   **+ Add activity to block** inside a curriculum block.
2. Picker appears with 8 tile options. Tutor picks **Library Note**.
3. A modal opens showing the tutor's library — folders on the left,
   notes on the right, search + tag filter.
4. Tutor picks one note; the modal closes and the note slots in
   loose under the unit (or into the curriculum block, depending on
   which entry point fired the picker) as an activity.

The activity row shows: type icon, note title, optional tutor-set
caption ("Read before Wednesday's session"), and the standard
up/down arrows for reordering.

### Adding a Shelf activity

1. Picker → Tutor picks **Shelf**.
2. A modal opens listing the tutor's shelves with colour dot, title,
   description, count, and a preview of the first 3 notes per shelf.
3. Tutor picks one shelf; the modal closes and the shelf slots in
   under the unit (or curriculum block) as a single grouped block —
   one attachment row per note on the shelf, all stamped with the
   shared `shelf_id` so the runtime can group them in the unit view.

**The grouped block** shows: a coloured outer border (the shelf's
colour), an identity bar at the top (shelf colour dot + title +
optional kebab), the constituent notes as individual activity rows
below, and an "Auto-syncing" banner explaining the membership
propagation.

**Auto-sync.** Adding or removing a note on the shelf later updates
every unit using that shelf — attachment rows are inserted / deleted
to match the shelf's current membership. Reordering the shelf
updates row `position`. Detaching the shelf from a unit removes all
attachment rows for that shelf in that unit. Detaching a single note
from a shelf-grouped attachment is also allowed (sets `shelf_id` to
NULL on that row — the note becomes a loose Library Note activity in
the unit, the rest of the shelf stays attached).

### Single source of truth

Both attachment paths are *pointers*, not copies. A Library Note
attachment stores `{note_id, programme_id, unit_id, block_id,
position, shelf_id?, caption?}` — nothing else. The actual content
lives once, in `nclex_tutor_library_notes`. When the tutor edits the
master note, every attachment renders the updated content
immediately. There is no "per-attachment copy" model in v1.
Confirmed call: it would feel wrong if editing your acid-base notes
left stale copies scattered across old cohorts.

### Visibility precondition

A note can only be attached to a unit if it is published. Draft
notes don't appear in the attach modal.

A Programme-scoped note can only be attached to a unit in the same
programme. Attaching it elsewhere is refused.

A shelf can mix Tutor-wide and Programme-scoped notes freely; when
the shelf is attached to a unit, each member note's visibility
determines whether students see that row. A Programme-scoped note on
a shelf attached to a different programme's unit results in
attachment rows that the students of that programme simply cannot
see — same rule as for individual Library Notes.

### Detach / delete behaviour

- **Detaching** a Library Note from a unit removes the activity row
  but leaves the master note untouched in the library.
- **Detaching** a shelf from a unit removes all attachment rows for
  that shelf at that unit. The shelf itself stays in the library.
- **Detaching a single note from a shelf-grouped attachment** sets
  `shelf_id` to NULL on that row — the note becomes a loose Library
  Note activity in the unit. The rest of the shelf-grouped
  attachment is unaffected.
- **Deleting** a master note is refused if it's attached anywhere
  (`ON DELETE RESTRICT`). The tutor must detach all attachments first.
  Same pattern as Trend datasets in the bank.
- **Deleting** a shelf is refused if it's attached anywhere
  (`ON DELETE RESTRICT`). Same pattern.
- **Unpublishing** a note that's attached: the note becomes invisible
  again (back to draft state), the attachments stay in place but
  render a "Note hidden by tutor" placeholder. Tutor can republish
  to restore.

---

## Student side

### Programme library surface

Route: most likely `/student/programme/[programme_id]/library/`
(exact path TBD at build time).

**The student library mirrors the tutor library's structure** — same
five-lens sidebar (Views, Folders, Shelves, Pillars, Tags), same
per-note lens row, same All folders / All shelves zoomed-out views.
Three adaptations:

| Aspect | Tutor | Student |
|---|---|---|
| Views section | All notes / Recent / **Drafts** / **Used nowhere** / + New view | All notes / Recent / **For this unit** / **Bookmarked** (author-hygiene views drop, student-state views replace) |
| Folder / Shelf entries | All shown | Only those with ≥1 visible note (empty containers hidden) |
| Sidebar counts | Total | Student-visible only (a folder of 7 for the tutor may show 5 to a Cohort 5 student) |
| Action affordances | + New folder / + New note / drag-to-add | None — read-only |
| Per-note right column | Status pill (Pub/Draft) + ↳ used-in pill + edited timestamp | Read button / Continue button / bookmark icon + read time + Unit-N task pill if attached to current unit |
| Note editor | Yes (full block-based editor) | No — clicking a note opens the read view |

**The student sees the same organisational structure as the tutor**,
just visibility-filtered. A folder of 7 for the tutor might show 3 to
a Cohort 5 student — sidebar counts reflect what's available to that
student, and folder contents are filtered automatically. Empty
containers are hidden from the student's sidebar entirely.

**No author-side framing on the student side.** No "Folder · private"
label (folders aren't private anymore — they're the tutor's primary
bin, and the student sees the same bin). No "Attached to / Visibility"
metadata panels on the shelf-scope view (that's tutor metadata). The
student-side All shelves view has the same Spotify-style carousels
but no trailing "+ Add to shelf" slot.

**Why mirror?** Two reasons:
- The tutor's organising structure (folders, shelves, pillars, tags)
  is *also* the most useful structure for the student to browse by.
  "I want to study pharm" → Shelves: Drug deep dives. "I want NCLEX
  PA coverage" → Pillars: PA. Same lens, same value, different
  audience.
- Architectural consistency means anyone who becomes a tutor (or
  vice versa) doesn't have to relearn the model.

### Reading a note (read-mode renderer)

A dedicated full-page route (not a modal) — `/student/library/note/[note_id]`
— with a read-only renderer that's a separate component from the
editor. Same JSONB block document drives both; the renderer just omits
the authoring affordances (toolbar, drag handle, kebab menu).

**Page chrome** (top to bottom):

1. **Back pill** — context-aware: "Back to Cardiac" (folder),
   "Back to Foundational SATA pack" (shelf), "Back to Unit 3" (when
   arriving from a unit activity row).
2. **Bookmark toggle** — top-right of the header, persists in the
   student's *Bookmarked* view.
3. **Title** — large.
4. **Metadata row** — pillar chip + tag chips (clickable to filter
   the library) + reading-time estimate (auto-calculated at ~200 wpm)
   + last-updated timestamp. Tutor name implicit by programme
   context, not labelled.
5. **Body** — the rendered block document.
6. **Foot** — *Mark as done* button (primary CTA — see Completion
   below) + "Next in [shelf/folder] →" link when reading from a
   container.

**Left rail — Contents panel**:
- Auto-built from H2/H3 headings in the body.
- Click an entry to jump.
- Scroll-spy highlights the active section.
- Foot of rail: thin reading-progress bar (% scrolled).
- Collapses to a hamburger / floating button on narrow viewports
  (build-time refinement).

**Per-block read rendering**:
- `paragraph` / `heading` / `list` / `quote` / `table` / `callout` /
  `drug_card` / `lab_values` — render in their authored shape,
  minus the authoring affordances.
- `image` — `<img>` + optional caption. Signed URL minted
  on-demand per render.
- `pdf` — **link card with "Open" button** (opens in new tab via
  signed URL). No inline iframe.
- `video` — embedded iframe (YouTube / Vimeo / Loom). Caption
  underneath.
- `embedded_question` — **interactive practice** (see below).

**Embedded question flow** (the differentiator):

*First time the student reaches an embed (scrolling through the note):*
1. Renders in answering mode — stem, options, Submit button.
2. Student answers, clicks Submit.
3. Transitions to feedback mode **inline** — right/wrong + per-option
   feedback + rationale + snapshot frozen to `nclex_library_embed_answers`.
4. Note continues below the embed; student keeps reading.

*Re-entering the note later (after a previous submit):*
1. Note renders fully top-to-bottom.
2. Each previously-submitted embed shows submitted-answer + feedback
   in read-only state (the snapshot, not the live question — preserves
   the moment-of-submit content).
3. New embeds (added after the student's last read) render in
   answering mode.
4. Student scrolls unfettered — no gating, no re-answer.

Same per-question-runner components as the main runner uses (with a
`mode="library_embed"` variant). No re-answer button in v1. No
"required to proceed" gating in v1.

#### Completion semantics

**Manual mark-done only.** A *Mark as done* button at the foot of the
note records completion via the existing progress-engine
`markActivityDone` / `unmarkActivityDone` server actions. Consistent
with the other passive-content activity types (Text, PDF, External
link, Live session) — no new completion concept introduced.

Embedded question submissions live in
`nclex_library_embed_answers` — they are *question*-level state, not
*note*-level state. A student might submit all embeds and still not
mark the note done (chose to stop mid-rationale-reading); a student
might mark a note done having skimmed past the embeds. Both are
valid; the two signals stay separate.

Rejected alternatives:
- *Auto-done on scroll-to-bottom* — game-able (fast-scroll without
  reading).
- *Auto-done when all embeds answered* — only works if the note has
  embeds; would need fallback rules and adds a completion concept.

#### Smaller calls

- **Reading-time** estimate auto-calculated at ~200 wpm at save time;
  shown in the header.
- **Tag chips** in the metadata row are clickable → filter the
  library by that tag.
- **Bookmark icon** in the header toggles the note in the student's
  *Bookmarked* view.
- **Print / export** — deferred per *What's NOT in v1*.

### Scheduled vs unscheduled appearance

- Notes attached to a unit of an enrolled programme also appear in
  that **unit's activity list** as a tracked task with completion
  tick (passive content — student-ticked, not auto-completed unless
  the note contains embedded questions, in which case completion
  rules per programme structure apply). When attached inside a
  curriculum block, the note participates in that block's done
  rollup like any other in-block activity. When attached via a
  shelf-grouped block, the note participates in the shelf block's
  visual grouping in the unit view.
- Notes only visible via Tutor-wide (not attached) appear in the
  library only — not in any unit's activity list.

The mental model: library = "what's available to read." Unit
activities = "what your tutor wants you to read this unit." Same
content surface in two contexts.

---

## Embedded questions — the differentiating feature

The `embedded_question` block (Group 4 — Interactive) is the
differentiating capability of the library. A note on *"How to attack
SATA questions"* embeds two real SATA questions inline as guided
practice — student reads, attempts, sees feedback, reads on. Without
this, the library is a notes app; with it, it's a teaching surface.

Provisional in earlier drafts (likely to slip if runner reuse turned
out painful) — now treated as **v1**, with the markdown-fallback
escape hatch still available for the whole editor if cost runs over.

### Mechanics

A note's body can include `embedded_question` blocks. Each block
references a single bank item by `item_id`, from the **tutor's own
bank only** (not the QAcademy shared bank — locked 2026-05-16 for
editorial control + attribution clarity + cross-ownership deletion
hygiene). Source field retained as a forward-compat enum (currently
fixed at `TUTOR`).

When the student reads the note and reaches an embed:
- The question renders in answering mode.
- Student answers. Submit fires.
- Student sees right/wrong + per-option feedback + rationale.
- Reading continues.

On re-render later (same student, same note):
- Previously-submitted embeds show in **read-only submitted state**
  (submitted answer + feedback visible).
- New embeds (added to the note after the student last read it) show
  in answering mode.
- No re-answer in v1 — once submitted, the embed is locked.

### Attempt-tracking — separate table, no pollution of student analytics

**Locked 2026-05-16: embed answers live in their own table
`nclex_library_embed_answers`, NOT in `nclex_attempts`.**

Three reasons drove the separation:
1. **Semantic fit.** `nclex_attempts` is built around the "session of
   questions" model (start time, end time, status, duration, pass/fail).
   An embedded question is one-shot, asynchronous, mid-reading — no
   session. Forcing it into the session model muddies what
   `nclex_attempts` actually means.
2. **Pollution risk.** Analytics queries that read `nclex_attempts`
   and forget a `source != 'LIBRARY_EMBED'` filter are a recurring
   quiet bug class. Physical separation eliminates the whole class —
   embed answers are never in the attempts table to begin with.
3. **Lighter rows.** Embed answers don't need status / duration /
   intent fields; a dedicated table can be slim.

A student's answer on an embedded question:
- Does **not** count toward their main practice analytics
- Does **not** affect their pool state (Unseen → Seen, Correct/Incorrect)
- Does **not** appear in their question history
- Does **not** affect Readiness Signal or any other analytic surface

The reason: a note-embedded question is a teaching interaction, not
a quiz. Polluting analytics with one-off embed answers would distort
the student's signal. They might re-read a note three times to study;
their pool state shouldn't shift.

### Tutor-side analytics — v2+, schema-supported from day one

Once tutor analytics arrives, rows from `nclex_library_embed_answers`
become a powerful signal for tutors: *"80% of students failed the
SATA in my acid-base note"* is exactly the kind of teaching insight
that justifies the feature. The schema is shaped right for this from
day one — `student_id` + `note_id` + `block_id` + `item_id` +
`is_correct` are all in place.

### Snapshot at submit time

When a tutor edits a note (or the embedded question itself) while a
student is mid-read, what does the student see?

For text content (paragraphs, headings, callouts, drug cards, etc.),
immediate visibility is fine — even desirable. The student sees the
latest authoritative content.

For embedded questions where a student has already submitted an
answer, the *content + correct* snapshot at submit time **must** be
preserved. Otherwise a tutor editing the question rationale after a
student submits could retroactively change what the student is
deemed right/wrong against.

**Resolved** — same snapshot pattern the runner already uses for
`nclex_attempt_items`: when the student submits an embed, capture
`body_json` + `correct_options` + `rationale` at that moment into
`nclex_library_embed_answers.snapshot_json`. Re-renders read from
the snapshot, not the live question.

### Question deletion behaviour

A bank question embedded in any note cannot be deleted from the
tutor's bank. `ON DELETE RESTRICT` on the embed reference. Tutor
must remove the embed from all notes before deleting the question.

Same pattern as Case Study children and Trend dataset children.

---

## Schema sketch

Six tables. Names follow the `nclex_tutor_*` prefix convention of
the existing parallel-ownership tutor side.

```
nclex_tutor_library_folders
  folder_id          TEXT PK
  tutor_id           UUID FK -> nclex_users(id) ON DELETE CASCADE
  name               TEXT NOT NULL
  description        TEXT                          -- nullable; brief copy
                     -- explaining what this folder is for. Shown as the
                     -- sub-line on the folder card in the "All folders"
                     -- zoomed-out view, and as a sub-head under the
                     -- title on the folder scope page.
  position           INTEGER NOT NULL DEFAULT 0   -- folder sort order
  created_at         TIMESTAMPTZ DEFAULT NOW()
  updated_at         TIMESTAMPTZ DEFAULT NOW()

nclex_tutor_library_shelves
  shelf_id           TEXT PK
  tutor_id           UUID FK -> nclex_users(id) ON DELETE CASCADE
  title              TEXT NOT NULL
  description        TEXT                          -- nullable; the "Every cohort gets these in week 1" tagline
  color              TEXT NOT NULL                 -- hex; used for rail-side dot, pip, attached grouped-block border
  position           INTEGER NOT NULL DEFAULT 0    -- shelf sort order in sidebar
  created_at         TIMESTAMPTZ DEFAULT NOW()
  updated_at         TIMESTAMPTZ DEFAULT NOW()

  -- No visibility_mode, no is_published. Shelves are pure
  -- organisational containers. Their visibility is implicit from
  -- membership — a shelf is visible to a student if any of its notes
  -- are visible to them.

nclex_tutor_library_shelf_memberships
  shelf_id           TEXT FK -> nclex_tutor_library_shelves ON DELETE CASCADE
  note_id            TEXT FK -> nclex_tutor_library_notes ON DELETE CASCADE
  position           INTEGER NOT NULL DEFAULT 0    -- order within shelf
  added_at           TIMESTAMPTZ DEFAULT NOW()
  PRIMARY KEY (shelf_id, note_id)

  -- M:N join. A note can be on 0..N shelves; a shelf can hold 0..M
  -- notes. Position is per-shelf — same note can have different
  -- ordinal in different shelves.

nclex_tutor_library_notes
  note_id            TEXT PK
  tutor_id           UUID FK -> nclex_users(id) ON DELETE CASCADE
  folder_id          TEXT FK -> nclex_tutor_library_folders ON DELETE SET NULL
                     -- nullable; null = root-level note (no folder)
  title              TEXT NOT NULL
  subtitle           TEXT                          -- nullable; shorter
                     -- secondary headline shown directly under the title
                     -- (tutor edit view + student read-mode view).
                     -- Example: title "Acid-base balance" + subtitle
                     -- "Compensation mechanisms and ABG interpretation".
  description        TEXT                          -- nullable; brief abstract
                     -- of the note. Drives the per-note lens row on the
                     -- library home (replaces the auto-excerpt of `body`
                     -- when set), the sub-line on attached-activity rows
                     -- in the unit view, and the card text on shelf
                     -- carousel tiles. Falls back to an auto-generated
                     -- excerpt of `body` when null.
  body               JSONB NOT NULL DEFAULT '[]'::jsonb
                     -- array of typed blocks
  tags               TEXT[] NOT NULL DEFAULT '{}'
  pillar             TEXT NOT NULL                 -- NCLEX Client Needs sub-category
                     CHECK (pillar IN ('MoC','SIC','HPM','PI','BCC','PPT','ROR','PA'))
                     -- Single primary pillar per note (v1). Promote
                     -- to array `pillars TEXT[]` in v1.5 without
                     -- migration if real tutors need many.
  position           INTEGER NOT NULL DEFAULT 0   -- order within folder
  is_published       BOOLEAN NOT NULL DEFAULT FALSE
  visibility_mode    TEXT NOT NULL DEFAULT 'TUTOR_WIDE'
                     CHECK (visibility_mode IN ('TUTOR_WIDE','PROGRAMME_SCOPED'))
  scoped_programme_id TEXT FK -> nclex_programmes ON DELETE CASCADE
                     -- nullable; required when visibility_mode = 'PROGRAMME_SCOPED'
  created_at         TIMESTAMPTZ DEFAULT NOW()
  updated_at         TIMESTAMPTZ DEFAULT NOW()

nclex_tutor_library_note_attachments
  attachment_id      TEXT PK
  note_id            TEXT FK -> nclex_tutor_library_notes ON DELETE RESTRICT
  shelf_id           TEXT FK -> nclex_tutor_library_shelves ON DELETE CASCADE
                     -- nullable; set when this attachment came from a shelf-attach
                     -- (and the row is part of a grouped block in the unit view).
                     -- Null = loose Library Note activity.
  programme_id       TEXT FK -> nclex_programmes ON DELETE CASCADE
  unit_id            TEXT FK -> nclex_programme_units ON DELETE CASCADE
  block_id           TEXT FK -> nclex_programme_blocks ON DELETE CASCADE
                     -- nullable; null = loose under unit, set = inside a curriculum block
  position           INTEGER NOT NULL DEFAULT 0   -- order within parent (unit, block, or shelf-group)
  caption            TEXT                          -- nullable; tutor's "Read before Wednesday" annotation
  created_at         TIMESTAMPTZ DEFAULT NOW()

nclex_library_embed_answers
  answer_id          TEXT PK
  student_id         UUID FK -> nclex_users(id) ON DELETE CASCADE
  note_id            TEXT FK -> nclex_tutor_library_notes(note_id) ON DELETE CASCADE
  block_id           TEXT NOT NULL                 -- the embedded_question block's ID within the note
  item_id            TEXT FK -> nclex_bank_items(item_id) ON DELETE RESTRICT
                     -- prevents deletion of a bank question while embed answers exist
  answer_json        JSONB NOT NULL                -- the student's submitted answer (per question type)
  is_correct         BOOLEAN NOT NULL
  snapshot_json      JSONB NOT NULL                -- content + correct + rationale at submit time
                     -- preserves attempt integrity if the tutor edits the question later
  submitted_at       TIMESTAMPTZ DEFAULT NOW()

  UNIQUE (student_id, note_id, block_id)
  -- One answer per student per embed occurrence in a note. Multiple
  -- embeds of the same item_id in the same note are distinct because
  -- they have different block_ids.

  -- Deliberately NOT in nclex_attempts:
  --   1. No "session" semantic — embeds are one-shot, asynchronous
  --   2. Eliminates the recurring "forgot to filter LIBRARY_EMBED"
  --      pollution-risk bug class in analytics queries
  --   3. Lighter rows — no status/duration/intent fields needed
```

**Shelf-attach fan-out.** When a tutor picks "Shelf" in the activity
picker and selects shelf X for unit U, one attachment row is created
per note in shelf X's membership, all stamped with `shelf_id = X` and
the same `unit_id = U`. The runtime groups them in the unit view via
`shelf_id`. Sync behaviour on shelf changes:

- **Add note to shelf** → insert attachment rows for every unit the
  shelf is attached to (one per attachment context).
- **Remove note from shelf** → delete corresponding attachment rows.
- **Reorder shelf** → update `position` on attachment rows where
  `shelf_id` matches (unless the tutor has overridden — see open
  question on per-attachment reorder).
- **Detach shelf from unit** → delete all attachment rows with that
  `shelf_id` for that unit.
- **Detach a single note from a shelf-grouped attachment** → set
  `shelf_id = NULL` on that row. The note becomes a loose Library
  Note activity. The rest of the shelf's attachment rows in that
  unit are unaffected.

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
  { "type": "paragraph", "content": [{ "text": "The body keeps blood pH between ", "marks": [] }, { "text": "7.35–7.45", "marks": ["code"] }] },
  { "type": "callout", "tone": "warning", "content": [...] },
  { "type": "image", "asset_id": "img_abc123", "alt": "ABG compensation diagram", "caption": "Optional caption" },
  { "type": "embedded_question", "item_id": "TUTOR_SATA_00012", "source": "TUTOR" },
  { "type": "paragraph", "content": [...] }
]
```

Block types extend additively — adding a new block type is a
schema-free change (just teach the editor and renderer about it).

### RLS policies (sketch)

- `nclex_tutor_library_folders`: tutor sees own; **enrolled students
  see folders whose tutor's library they have access to** (i.e. any
  tutor running a programme they're enrolled in); SUPER_ADMIN bypass.
- `nclex_tutor_library_shelves`: same pattern as folders — tutor sees
  own, enrolled students see their tutors' shelves, SUPER_ADMIN
  bypass.
- `nclex_tutor_library_shelf_memberships`: derived from the shelf +
  note RLS — accessible if the viewer can see the shelf AND the note.
- `nclex_tutor_library_notes`: tutor sees own (any state); enrolled
  students see notes per visibility rules below; SUPER_ADMIN bypass.
- `nclex_tutor_library_note_attachments`: tutor sees own; enrolled
  students see attachments for their programmes (filtered to notes
  they can see); SUPER_ADMIN bypass.
- `nclex_library_embed_answers`: **student sees own rows only**;
  tutor sees rows for embeds of their own bank questions (for future
  v2+ analytics); SUPER_ADMIN bypass. INSERT is restricted to the
  student-side `submitLibraryEmbedAnswer` action; UPDATE is
  disallowed (snapshot is captured once and frozen).

The student-visibility rule for notes is the load-bearing one. Likely
shape: a helper function `nclex_student_can_see_note(note_id)` that
returns true iff:

- The note is `is_published = TRUE`, AND either
- `visibility_mode = 'TUTOR_WIDE'` AND the student is enrolled in
  ANY programme run by the note's tutor, OR
- `visibility_mode = 'PROGRAMME_SCOPED'` AND the student is enrolled
  in `scoped_programme_id`.

Folders and shelves use this same helper transitively — a folder is
visible to a student if any note in it is; same for shelves. The
"empty container hiding" on the student side is implemented as
filtering folders/shelves whose `COUNT(visible notes) = 0` out of the
sidebar query.

---

## Build size estimate

Realistic: **6–8 weeks of focused work** for v1 (revised after the
editor side was fully specified — 12 block types including extensible
Drug card + Lab values, dedicated embed-answers table, end-to-end
read-mode renderer).

| Stage | Size |
|---|---|
| Schema + RLS + visibility helper function + embed-answers table | ~1 week |
| Library list + 5-lens sidebar + folder/shelf management + All-folders / All-shelves zoomed-out views | ~5 days |
| NCLEX pillars — chip palette + sidebar entries + editor field + filtering | ~3 days |
| Tiptap editor scaffold — starter-kit + slash command + `+` button + drag handle + always-visible toolbar + autosave + propagation warning | ~1 week |
| Standard blocks (8) — Heading / Paragraph / List / Quote / Image / PDF / Video / Table + media-upload pipeline | ~1 week |
| NCLEX domain blocks (3) — Callout (5 tones) + Drug card (extensible fields) + Lab values (extensible columns) | ~1 week |
| Embedded-question block — picker (tutor bank only), reference-card edit-mode rendering, interactive read-mode rendering, snapshot on submit, `nclex_library_embed_answers` writes | ~1 week |
| Programme integration — 8 activity types (Library Note + Shelf), attach modal, shelf-picker modal, attached/auto-syncing grouped block, used-in count | ~1.5 weeks |
| Student read-mode renderer — full-page route + Contents rail (scroll-spy + progress) + per-block rendering + embedded-question flow + manual mark-done | ~1 week |
| Student library — same 5-lens sidebar (read-only adaptations) + visibility-filtered counts + empty-container hiding | ~4 days |

Block editor is still the dominant unknown — the markdown-fallback
gate from the original plan still applies, and would compress the
"Standard blocks" + "NCLEX domain blocks" stages (~2 weeks of work)
into a markdown-textarea slice of a few days. The NCLEX-domain blocks
(Drug card, Lab values, Callout) would survive the fallback as
structured markdown patterns rather than typed React nodes.

---

## What's NOT in v1

Tracking deliberately deferred:

- **QAcademy-side library** — admin-authored notes for self-study
  bank students. Schema-parallel; can land later without redesign.
- **Nested folders** — flat two-level (Folder → Note) is enough.
- **Per-attachment content variants** — single-source-of-truth only.
- **Tutor-side analytics on embedded questions** — schema supports it
  via `nclex_library_embed_answers`; UI is v2+.
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

1. **Schema + RLS** — five tables (folders, shelves, shelf
   memberships, notes, attachments) + policies + `nclex_student_can_see_note`
   helper function. Verify with seeded SQL before any UI.
2. **Library list page — folder scope** (tutor side) — five-lens
   sidebar (Views, Folders, Shelves, Pillars, Tags) + folder list +
   note list with per-note lens row. Body editor is a single
   textarea placeholder for now. Pillar chip rendered from the note's
   `pillar` field. Ship before the block editor lands.
3. **Library list page — All folders + All shelves** views — the
   zoomed-out folder cards grid + Spotify-style shelf carousels.
   Same data, different lens-scope. Builds the SHELVES table use.
4. **Library list page — shelf scope** — shelf detail view (numbered
   notes, no Attached-to/Visibility metadata on shelf itself).
5. **Tiptap editor scaffold** — starter-kit (paragraph, heading,
   list, quote, marks) + slash command + `+` button + drag handle
   + always-visible toolbar + autosave + edit-propagation warning.
   Ship with text-only blocks; verify the editor feel before adding
   custom nodes. **Provisional gate** — if the framework's going
   badly, fall back to markdown textarea and ship the rest of the
   library without rich blocks.
6. **Standard visual blocks** — Image (with Supabase Storage +
   on-demand signed URL pipeline + alt-text requirement + auto-resize)
   + PDF (link-card) + Video (YouTube/Vimeo/Loom embeds) + Table.
7. **NCLEX domain blocks (1/3) — Callout** with the 5 tones + icons.
8. **NCLEX domain blocks (2/3) — Drug card** with extensible field
   array, drag-reorder, add-field, remove-field. NCLEX-canonical 4
   fields pre-populated.
9. **NCLEX domain blocks (3/3) — Lab values** with extensible
   columns, column-add/rename/remove (with deletion warning), row
   add/remove. NCLEX-canonical 4 columns pre-populated.
10. **Publish flow + visibility mode + status pills** — wire the
    draft/published + tutor-wide/programme-scoped states end-to-end.
11. **Programme integration — Library Note path** — Library Note as
    the 7th activity type, attach modal (single note), detach,
    used-in count.
12. **Programme integration — Shelf path** — Shelf as the 8th
    activity type, shelf-picker modal, attached/auto-syncing grouped
    block in unit view, shelf-attach fan-out logic + propagation on
    shelf membership changes.
13. **Student read-mode renderer** — full-page route + Contents rail
    + scroll-spy + per-block rendering + manual mark-done. Embedded
    questions render in answering mode (no submit yet — gated by
    step 14).
14. **Student library** — same five-lens sidebar (read-only
    adaptations), visibility-filtered counts, empty-container
    hiding, Views adapted (For this unit / Bookmarked replace
    Drafts / Used nowhere).
15. **Embedded question — full loop** — picker in editor (tutor
    bank only), reference-card edit-mode rendering, interactive
    answering in read mode, submit → write to
    `nclex_library_embed_answers` with snapshot, post-submit
    feedback rendering, on-re-render show submitted state.
16. **Polish** — search, tag + pillar filtering, used-in click-through,
    save dialogs, NCLEX_* tag seeding, the lot.

---

## Cross-references — TODO

When this feature gets queued for build, three other planning docs
need updating:

- **[main.md](main.md) — Programme Structure → Activity types.** Add
  **Library Note** as the 7th activity type AND **Shelf** as the 8th.
  Move both from "deferred" to "v1" if/when the library ships.
- **[curriculum-authoring-ux.md](curriculum-authoring-ux.md) —
  Activity editors.** Add Library Note as the 7th editor AND Shelf
  as the 8th editor in the table (Type / Fields columns). Note that
  the editors are "pick from library" / "pick a shelf" not "edit
  inline." Document the shelf-attach fan-out and grouped-block
  treatment.
- **`docs/product-plan/tutor-nav.html`** — programme sidebar may
  want a Library entry alongside Curriculum, Live Sessions, etc.,
  for the tutor's quick access into their own library from inside a
  programme context.

These edits are deferred until the feature is actually queued, to
avoid promising something that may slip again.

---

## Open questions deferred to build

Resolved during the 2026-05-16 sync:

- ~~Student library landing UX~~ → resolved: mirror tutor structure
  (same 5-lens sidebar, read-only adaptations, visibility-filtered
  counts).
- ~~Folder visibility model~~ → resolved: folders are not private;
  visibility lives on the note.
- ~~Shelf visibility model~~ → resolved: shelves have no visibility
  field; visibility is implicit from membership.
- ~~Pillars as lens vs metadata~~ → resolved: both. Sidebar lens for
  browsing + chip on every note row.
- ~~Block editor framework~~ → resolved: **Tiptap** (MIT,
  ProseMirror-based, React-first). Markdown-textarea fallback retained
  as build-time escape hatch.
- ~~Embedded-question snapshot policy~~ → resolved: snapshot at submit
  time, frozen to `nclex_library_embed_answers.snapshot_json`. Same
  conceptual pattern the runner uses for `nclex_attempt_items`.
- ~~Where embed answers live~~ → resolved: **separate table
  `nclex_library_embed_answers`**, not in `nclex_attempts`. Reasons:
  semantic fit (no session model forced), pollution-risk elimination
  (analytics queries never accidentally include embeds), lighter rows.
- ~~Embed source — tutor bank vs QAcademy bank~~ → resolved: **tutor's
  own bank only**. Editorial control + attribution clarity +
  cross-ownership deletion hygiene.
- ~~Drug card extensibility~~ → resolved: extensible from day one
  (no v1.5 migration). NCLEX-canonical 4 fields pre-populated.
- ~~Lab values extensibility~~ → resolved: extensible columns from
  day one. NCLEX-canonical 4 columns pre-populated.

Still open:

- **Concurrent-edit conflicts** between co-tutors on a shared note.
  Low priority for v1 cohort sizes.
- **Per-attachment reorder override** for shelf-grouped notes — when
  a tutor reorders a note inside a shelf-grouped attachment, does
  that propagate back to shelf order, or stay local to the unit?
  Recommendation: store `attachment.position` independently; the
  unit can diverge from shelf order without affecting the source.
  Needs a visual cue for "this row was manually moved" to avoid
  silent divergence.
- **Skip-one-note from a shelf attachment** as a v1 affordance? Or
  defer to v1.5 with a per-attachment `skipped_note_ids` array?
  Current default: kebab → "remove from this unit" on a single
  shelf-grouped row sets `shelf_id = NULL` and breaks the link
  (becomes a loose Library Note in the unit). This works in v1.
- **Visibility intersection conflict warning** — surfaced when a
  shelf contains a mix of Tutor-wide and Programme-scoped notes,
  and the resulting student-visible set is non-obvious. The mockup
  doesn't yet show this warning UI.
- **Lock-attached-shelf as snapshot** (v1.5) — for tutors who want
  "snapshot the shelf as it is today" rather than auto-sync. Open
  in the handoff README #3.
- **Whether to fold Text and PDF activity types into Library Note**
  (decided: leave alone for now, revisit if the redundancy bites).
- **Collapsible library sidebar** — collapse-to-icons treatment for
  narrow viewports or tutors who want more horizontal room. Small
  polish, defer until requested.

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
